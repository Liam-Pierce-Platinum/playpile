// Tilt-shift miniature pass: scene -> MSAA HDR target -> horizontal band blur -> vertical band blur + toy grade.
import * as THREE from '../vendor/three.module.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const BLUR = `
uniform sampler2D tD; uniform vec2 dir, res; uniform float focus, band, amt;
varying vec2 vUv;
float k(vec2 uv){ float dy = abs(uv.y - focus); float dx = abs(uv.x - .5) * .35; return smoothstep(band, band + .38, dy + dx * dx) * amt; }
vec4 blur(){ float a = k(vUv); vec4 s = vec4(0.); float tw = 0.;
  for (int i = -7; i <= 7; i++) { float f = float(i); float w = exp(-f * f / 24.); s += texture2D(tD, vUv + dir * f * a / res) * w; tw += w; }
  return s / tw; }`;
const H = BLUR + 'void main(){ gl_FragColor = blur(); }';
const V = BLUR + `
uniform float time, vig;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
void main(){
  vec3 c = blur().rgb * 1.08;
  c = aces(c);
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(vec3(l), c, 1.32);                       // toy-paint saturation
  c = pow(max(c, 0.), vec3(1. / 2.2));              // to sRGB
  c = mix(c, c * vec3(1.04, 1.0, .93) + vec3(.02, .01, -.01), .6); // warm print
  c = (c - .5) * 1.06 + .5;
  vec2 q = vUv - .5; c *= 1. - vig * dot(q, q) * 1.6;
  c += (h(vUv * res) - .5) * .025;
  gl_FragColor = vec4(c, 1.);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer; this.a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.b = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const u = () => ({ tD: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, res: { value: new THREE.Vector2(4, 4) }, focus: { value: 0.5 }, band: { value: 0.1 }, amt: { value: 7 } });
    this.mh = new THREE.ShaderMaterial({ uniforms: u(), vertexShader: VS, fragmentShader: H, depthTest: false, depthWrite: false });
    const uv = u(); uv.dir.value.set(0, 1); uv.time = { value: 0 }; uv.vig = { value: 0.55 };
    this.mv = new THREE.ShaderMaterial({ uniforms: uv, vertexShader: VS, fragmentShader: V, depthTest: false, depthWrite: false });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.q = new THREE.Mesh(g, this.mh); this.q.frustumCulled = false; this.s = new THREE.Scene(); this.s.add(this.q); this.c = new THREE.Camera();
  }
  setSize(w, h) { this.a.setSize(w, h); this.b.setSize(w, h); for (const m of [this.mh, this.mv]) m.uniforms.res.value.set(w, h); const s = h / 720; this.mh.uniforms.amt.value = this.mv.uniforms.amt.value = 6.5 * Math.max(0.6, s); }
  render(scene, cam, t, focus = 0.5) {
    const r = this.r; r.setRenderTarget(this.a); r.render(scene, cam);
    this.mh.uniforms.tD.value = this.a.texture; this.mh.uniforms.focus.value = focus; this.q.material = this.mh; r.setRenderTarget(this.b); r.render(this.s, this.c);
    this.mv.uniforms.tD.value = this.b.texture; this.mv.uniforms.focus.value = focus; this.mv.uniforms.time.value = t % 10; this.q.material = this.mv; r.setRenderTarget(null); r.render(this.s, this.c);
  }
}
