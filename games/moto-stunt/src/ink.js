// Comic-book look: halftone cel material + ink post pass (normal/depth edges, sunburst sky, paper grain).
import * as THREE from 'three';

const LIGHT = new THREE.Vector3(0.45, 0.8, 0.55).normalize();
const cache = new Map();

const VERT = `
varying vec3 vN; varying vec3 vW;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `
uniform vec3 uColor; uniform vec3 uShade; uniform vec3 uLight; uniform float uStrata; uniform float uShine; uniform float uDot; uniform vec3 uColor2; uniform vec3 uTop;
varying vec3 vN; varying vec3 vW;
float dots(float dark, float cell){
  vec2 p = gl_FragCoord.xy / cell; p = mat2(0.7071,-0.7071,0.7071,0.7071) * p;
  float d = length(fract(p) - 0.5); float r = sqrt(clamp(dark,0.0,1.0)) * 0.72;
  return 1.0 - smoothstep(r - 0.06, r + 0.06, d);
}
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  float l = dot(N, uLight) * 0.5 + 0.5;
  vec3 base = uColor;
  if(uStrata > 0.5){
    float band = floor(vW.y / 1.6 + sin(vW.x * 0.15) * 0.6);
    base = mod(band, 2.0) < 1.0 ? uColor : uColor2;
    if(N.y > 0.6) base = uTop;
  }
  vec3 shade = uShade * base;
  vec3 c;
  if(l > 0.68) c = base;
  else if(l > 0.42) c = mix(base, shade, dots((0.68 - l) / 0.26 * 0.55 + 0.1, uDot));
  else c = mix(shade, shade * 0.55, dots((0.42 - l) / 0.42 * 0.7 + 0.2, uDot * 0.8));
  if(uShine > 0.5 && l > 0.93) c = mix(c, vec3(1.0), 0.85);
  gl_FragColor = vec4(c, 1.0);
}`;

export function ink(color, o = {}) {
  const key = color + '|' + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: o.side || THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(o.color2 || color) }, uTop: { value: new THREE.Color(o.top || 0xf2c13a) },
      uShade: { value: new THREE.Color(o.shade || 0x8a7aa8) }, uLight: { value: LIGHT },
      uStrata: { value: o.strata ? 1 : 0 }, uShine: { value: o.shine ? 1 : 0 }, uDot: { value: o.dot || 7 },
    },
  });
  cache.set(key, m);
  return m;
}

const POST_F = `
uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTime; uniform float uThick;
uniform vec3 uSkyA; uniform vec3 uSkyB; uniform vec3 uSkyC; uniform vec3 uInk; uniform float uFlash;
varying vec2 vUv;
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 px = uThick / uRes;
  float dc = texture2D(tDepth, vUv).r;
  vec3 col;
  if(dc >= 0.99999){
    vec2 sun = vec2(0.72, 0.78); vec2 d = (vUv - sun) * vec2(uRes.x / uRes.y, 1.0);
    float a = atan(d.y, d.x); float rays = step(0.5, fract(a * 3.8197 + uTime * 0.02));
    vec3 sky = mix(uSkyB, uSkyA, smoothstep(0.1, 0.9, vUv.y));
    col = mix(sky, sky * 0.86 + uSkyC * 0.14, rays);
    float r = length(d);
    vec2 hp = mat2(0.7071,-0.7071,0.7071,0.7071) * gl_FragCoord.xy / 9.0;
    float dotr = (1.0 - vUv.y) * 0.55; float hd = length(fract(hp) - 0.5);
    col = mix(col, uSkyC, (1.0 - smoothstep(dotr - 0.05, dotr + 0.05, hd)) * 0.35);
    col = mix(col, vec3(1.0, 0.95, 0.6), 1.0 - smoothstep(0.11, 0.12, r));
    col = mix(col, uInk, smoothstep(0.112, 0.118, r) * (1.0 - smoothstep(0.124, 0.13, r)));
  } else {
    col = texture2D(tColor, vUv).rgb;
  }
  float zc = lin(dc); vec3 nc = texture2D(tNormal, vUv).rgb;
  float e = 0.0;
  for(int i = 0; i < 4; i++){
    vec2 o = i == 0 ? vec2(px.x,0.0) : i == 1 ? vec2(-px.x,0.0) : i == 2 ? vec2(0.0,px.y) : vec2(0.0,-px.y);
    float z = lin(texture2D(tDepth, vUv + o).r); vec3 n = texture2D(tNormal, vUv + o).rgb;
    e = max(e, smoothstep(0.035, 0.07, abs(z - zc) / min(z, zc)));
    if(z < uFar * 0.9 && zc < uFar * 0.9) e = max(e, smoothstep(0.25, 0.45, length(n - nc)));
  }
  col = mix(col, uInk, e);
  float g = hash(floor(gl_FragCoord.xy / 2.0) + floor(uTime * 8.0));
  col *= 0.965 + 0.05 * g;
  col = mix(col, vec3(1.0), uFlash);
  vec2 v = vUv - 0.5; col *= 1.0 - dot(v, v) * 0.45;
  gl_FragColor = vec4(col, 1.0);
}`;

export function makePost(renderer) {
  const size = new THREE.Vector2();
  const mk = (depth, samples) => {
    const t = new THREE.WebGLRenderTarget(4, 4, { samples });
    if (depth) { t.depthTexture = new THREE.DepthTexture(4, 4); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  const tN = mk(true, 0), tC = mk(false, 4);
  const normMat = new THREE.MeshNormalMaterial();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: POST_F, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: tC.texture }, tNormal: { value: tN.texture }, tDepth: { value: tN.depthTexture },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 400 }, uTime: { value: 0 }, uThick: { value: 1.5 },
      uSkyA: { value: new THREE.Color() }, uSkyB: { value: new THREE.Color() }, uSkyC: { value: new THREE.Color() },
      uInk: { value: new THREE.Color(0x1b1026) }, uFlash: { value: 0 },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  return {
    u: mat.uniforms,
    sky(a, b, c) { mat.uniforms.uSkyA.value.set(a); mat.uniforms.uSkyB.value.set(b); mat.uniforms.uSkyC.value.set(c); },
    render(scene, cam, t) {
      renderer.getDrawingBufferSize(size);
      if (tN.width !== size.x || tN.height !== size.y) { tN.setSize(size.x, size.y); tC.setSize(size.x, size.y); }
      mat.uniforms.uRes.value.copy(size); mat.uniforms.uNear.value = cam.near; mat.uniforms.uFar.value = cam.far;
      mat.uniforms.uTime.value = t; mat.uniforms.uThick.value = Math.max(1.2, size.y / 520);
      scene.overrideMaterial = normMat; renderer.setRenderTarget(tN); renderer.render(scene, cam);
      scene.overrideMaterial = null; renderer.setRenderTarget(tC); renderer.render(scene, cam);
      renderer.setRenderTarget(null); renderer.render(qs, quadCam);
    },
  };
}
