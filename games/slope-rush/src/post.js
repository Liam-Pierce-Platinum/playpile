// Two-level bloom + chromatic aberration, ACES, scanlines, vignette, grain. Hand-rolled, no addons.
import * as THREE from '../vendor/three.module.js';
const V = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const BRIGHT = `uniform sampler2D t; uniform float th; varying vec2 vUv;
void main(){ vec3 c=texture2D(t,vUv).rgb; float l=max(c.r,max(c.g,c.b)); if(!(l>=0.0) || l>1e4) { c=vec3(0.); l=0.; } gl_FragColor=vec4(c*smoothstep(th,th+0.6,l),1.); }`;
const BLUR = `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
void main(){ vec3 c=texture2D(t,vUv).rgb*0.227;
 c+=(texture2D(t,vUv+dir*1.384).rgb+texture2D(t,vUv-dir*1.384).rgb)*0.316;
 c+=(texture2D(t,vUv+dir*3.230).rgb+texture2D(t,vUv-dir*3.230).rgb)*0.070; gl_FragColor=vec4(c,1.); }`;
const COMP = `uniform sampler2D tS,tH,tQ; uniform float time,flash,aber,bloom; uniform vec3 flashCol; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
void main(){ vec2 d=vUv-0.5; float r2=dot(d,d); vec2 o=d*aber*r2;
 vec3 c=vec3(texture2D(tS,vUv+o).r, texture2D(tS,vUv).g, texture2D(tS,vUv-o).b);
 vec3 b=texture2D(tH,vUv).rgb*0.8+texture2D(tQ,vUv).rgb*1.3; c+=b*bloom;
 c=aces(c*1.15); c+=flashCol*flash;
 c*=1.0-r2*1.1; c*=0.93+0.07*sin(gl_FragCoord.y*3.14159);
 c+=(fract(sin(dot(gl_FragCoord.xy+time*61.0,vec2(12.9898,78.233)))*43758.5453)-0.5)*0.03;
 gl_FragColor=vec4(c,1.); }`;
export class Post {
  constructor(renderer) {
    this.r = renderer;
    const o = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.h1 = new THREE.WebGLRenderTarget(4, 4, o); this.h2 = new THREE.WebGLRenderTarget(4, 4, o);
    this.q1 = new THREE.WebGLRenderTarget(4, 4, o); this.q2 = new THREE.WebGLRenderTarget(4, 4, o);
    const M = (f, u) => new THREE.ShaderMaterial({ vertexShader: V, fragmentShader: f, uniforms: u, depthTest: false, depthWrite: false });
    this.mB = M(BRIGHT, { t: { value: null }, th: { value: 0.75 } });
    this.mBl = M(BLUR, { t: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mC = M(COMP, { tS: { value: this.rt.texture }, tH: { value: this.h1.texture }, tQ: { value: this.q1.texture }, time: { value: 0 }, flash: { value: 0 }, aber: { value: 0.012 }, bloom: { value: 1.0 }, flashCol: { value: new THREE.Color(1, 1, 1) } });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.sc = new THREE.Scene(); this.sc.add(this.quad);
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    this.h1.setSize(hw, hh); this.h2.setSize(hw, hh); this.q1.setSize(qw, qh); this.q2.setSize(qw, qh);
    this.hs = [1 / hw, 1 / hh]; this.qs = [1 / qw, 1 / qh];
  }
  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.sc, this.cam); }
  render(scene, camera, t) {
    const r = this.r;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    this.mB.uniforms.t.value = this.rt.texture; this.pass(this.mB, this.h1);
    const blur = (a, b, s) => {
      this.mBl.uniforms.t.value = a.texture; this.mBl.uniforms.dir.value.set(s[0], 0); this.pass(this.mBl, b);
      this.mBl.uniforms.t.value = b.texture; this.mBl.uniforms.dir.value.set(0, s[1]); this.pass(this.mBl, a);
    };
    blur(this.h1, this.h2, this.hs);
    this.mBl.uniforms.t.value = this.h1.texture; this.mBl.uniforms.dir.value.set(0, 0); this.pass(this.mBl, this.q1);
    blur(this.q1, this.q2, this.qs); blur(this.q1, this.q2, [this.qs[0] * 2, this.qs[1] * 2]);
    this.mC.uniforms.time.value = t; this.pass(this.mC, null);
  }
}
