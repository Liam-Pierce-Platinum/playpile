// N64 render pipeline: low internal resolution -> 5-bit colour + Bayer dither
// -> nearest-neighbour blit to the screen.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 4x4 Bayer matrix. Dithering is what sold N64 gradients on a 16-bit framebuffer.
const FRAG = /* glsl */`
precision mediump float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2  uRes;      // internal resolution
uniform float uLevels;   // colour steps per channel
uniform float uDither;   // dither strength
uniform float uScan;     // scanline strength

float bayer(vec2 p){
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  // 0..15 threshold table, unrolled (no dynamic indexing on old GLSL)
  float v = 0.0;
  if(i== 0) v= 0.0;  else if(i== 1) v= 8.0;  else if(i== 2) v= 2.0;  else if(i== 3) v=10.0;
  else if(i== 4) v=12.0; else if(i== 5) v= 4.0; else if(i== 6) v=14.0; else if(i== 7) v= 6.0;
  else if(i== 8) v= 3.0; else if(i== 9) v=11.0; else if(i==10) v= 1.0; else if(i==11) v= 9.0;
  else if(i==12) v=15.0; else if(i==13) v= 7.0; else if(i==14) v=13.0; else            v= 5.0;
  return v / 16.0 - 0.5;
}

void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 px = vUv * uRes;

  // The render target is linear, and this is a raw shader pass, so three.js
  // does no conversion for us. Encode to display space HERE, before
  // quantizing -- the real hardware quantized the display-space framebuffer.
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));

  // dithered quantization
  float d = bayer(px) * uDither;
  c = floor(c * uLevels + 0.5 + d) / uLevels;

  // very light CRT scanline
  float s = 1.0 - uScan * step(0.5, fract(px.y * 0.5));
  c *= s;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class N64Pipeline {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = true;
    this.internalHeight = opts.internalHeight ?? 240;
    this.maxWidth = opts.maxWidth ?? 480;

    this.target = new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uRes:     { value: new THREE.Vector2(320, 240) },
      uLevels:  { value: 31.0 },   // 5 bits per channel, like the real thing
      uDither:  { value: 1.0 },
      uScan:    { value: 0.06 },
    };

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1,-1,0,  3,-1,0,  -1,3,0 ]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0,0,  2,0,  0,2 ]), 2));
    this.quad = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(w, h) {
    this.displayW = w; this.displayH = h;
    const aspect = w / h;
    let ih = this.internalHeight;
    let iw = Math.round(ih * aspect);
    if (iw > this.maxWidth) { iw = this.maxWidth; ih = Math.round(iw / aspect); }
    this.target.setSize(iw, ih);
    this.uniforms.uRes.value.set(iw, ih);
    this.renderer.setSize(w, h, false);
  }

  get internalSize() { return this.uniforms.uRes.value; }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.setScissorTest(false);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  /**
   * TWO PLAYERS, one screen.
   *
   * The console's answer was to halve the picture and give each player their
   * own camera, so that is what this does: the world is drawn twice into the
   * same low-resolution target, once per viewport, and the filter runs over
   * the whole thing at the end. Splitting AFTER the filter would give each
   * half its own dither grid and the seam would crawl.
   *
   * @param views  [{ camera }, { camera }] -- top and bottom
   */
  renderSplit(scene, views) {
    const r = this.renderer;
    const size = this.internalSize;
    const w = Math.round(size.x), h = Math.round(size.y);
    const half = Math.floor(h / 2);

    const target = this.enabled ? this.target : null;
    r.setRenderTarget(target);
    r.setScissorTest(true);
    if (this.enabled) r.clear();

    views.forEach((v, i) => {
      const y = i === 0 ? half : 0;              // player one on top
      if (this.enabled) {
        r.setViewport(0, y, w, half);
        r.setScissor(0, y, w, half);
      } else {
        const dh = Math.floor(this.displayH / 2);
        const dy = i === 0 ? dh : 0;
        r.setViewport(0, dy, this.displayW, dh);
        r.setScissor(0, dy, this.displayW, dh);
      }
      if (!this.enabled && i === 0) r.clear();
      r.render(scene, v.camera);
    });

    r.setScissorTest(false);
    if (this.enabled) {
      r.setRenderTarget(null);
      // The blit has to cover the SCREEN, not the render target. Leaving the
      // viewport at the internal 480x240 drew the whole split picture into a
      // small corner of the window.
      r.setViewport(0, 0, this.displayW, this.displayH);
      r.render(this.quadScene, this.quadCam);
    } else {
      r.setViewport(0, 0, this.displayW, this.displayH);
    }
  }
}
