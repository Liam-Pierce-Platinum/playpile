// Painterly voxel rendering: one instanced cube mesh + custom shaders for blocks, sky and the cloud sea.
import * as THREE from '../vendor/three.module.js';

// block types
export const T = { GRASS: 1, STONE: 2, WOOD: 3, BOUNCE: 4, ICE: 5, LAVA: 6, CHECK: 7, CLAY: 8, LEAVES: 9, SAND: 10, BRICK: 11, MOVER: 12 };
export const NAMES = { 1: 'Grass', 2: 'Stone', 3: 'Plank', 4: 'Bounce', 5: 'Ice', 6: 'Lava', 7: 'Gold', 8: 'Clay', 9: 'Leaves', 10: 'Sand', 11: 'Brick', 12: 'Lift' };

export const U = {
  uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
  uSun: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() },
  uFog: { value: new THREE.Color(1.0, 0.86, 0.76) }, uFogD: { value: 0.012 },
};

const NOISE = /* glsl */`
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

const blockVS = /* glsl */`
attribute float aType; attribute vec3 aTint;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vT; varying vec3 vTint;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vL = position; vT = aType; vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const blockFS = /* glsl */`
uniform float uTime; uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uFog; uniform float uFogD;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vT; varying vec3 vTint;
${NOISE}
void main(){
  vec3 n = normalize(vN); vec3 an = abs(n);
  bool top = n.y > .5, bot = n.y < -.5;
  vec2 uv = top||bot ? vL.xz : (an.x > .5 ? vL.zy : vL.xy);
  float edge = smoothstep(.34, .5, max(abs(uv.x), abs(uv.y)));
  int t = int(vT + .5);
  // brush strokes: fbm stretched along a slanted direction, like dabs of a flat brush
  vec3 sp = vW * 2.4;
  float stroke = fbm(vec3(sp.x + sp.y*.7, sp.y*3.2 - sp.z*.5, sp.z - sp.x*.6));
  float dab = fbm(vW * 5.5 + vec3(0., 0., stroke * 2.));
  float blot = fbm(vW * .23);
  vec3 c = vec3(.8); float emis = 0.; float spec = 0.;
  if (t == 1) { // grass
    vec3 g = mix(vec3(.38,.62,.28), vec3(.66,.80,.36), stroke);
    vec3 d = mix(vec3(.52,.36,.25), vec3(.68,.48,.31), stroke);
    float fringe = vL.y + (n3(vW*vec3(7.,0.,7.)+vec3(vW.y*3.)) - .5) * .3;
    c = top ? g : (bot ? d : mix(d, g * .92, smoothstep(.16, .22, fringe)));
  } else if (t == 2) { c = mix(vec3(.55,.56,.62), vec3(.74,.73,.76), stroke) * (.9 + .15*dab); }
  else if (t == 3) { float grain = n3(vec3(vW.x*1.2, vW.y*18., vW.z*1.2) + vec3(stroke*3.)); c = mix(vec3(.62,.42,.25), vec3(.82,.60,.36), grain); c *= 1. - .25*step(.46, abs(fract(vL.y*2.+.5)-.5)*2.-0.); }
  else if (t == 4) { c = mix(vec3(.95,.38,.62), vec3(1.,.66,.80), stroke); emis = .25 + .15*sin(uTime*6.); spec = .5; }
  else if (t == 5) { c = mix(vec3(.62,.84,.96), vec3(.90,.97,1.), dab); spec = 1.; }
  else if (t == 6) { float f = fbm(vec3(vW.xz*1.3, uTime*.6)); c = mix(vec3(.95,.32,.08), vec3(1.,.82,.25), smoothstep(.35,.75,f)); emis = .9; }
  else if (t == 7) { c = mix(vec3(.95,.70,.18), vec3(1.,.90,.45), stroke); emis = .3 + .2*sin(uTime*3. + vW.x); spec = .8; }
  else if (t == 8) { c = mix(vec3(.86,.52,.36), vec3(.96,.70,.50), stroke); }
  else if (t == 9) { c = mix(vec3(.26,.52,.30), vec3(.52,.74,.36), dab); c *= .85 + .3*step(.45, n3(vW*4.)); }
  else if (t == 10) { c = mix(vec3(.92,.82,.58), vec3(.99,.92,.72), dab); }
  else if (t == 11) { vec2 b = uv*vec2(2.,4.); b.x += step(1., mod(floor(b.y),2.))*.5; vec2 f = abs(fract(b)-.5);
    c = mix(vec3(.72,.34,.28), vec3(.86,.48,.36), stroke); c = mix(c, vec3(.82,.76,.70), step(.42, max(f.x*1., f.y))); }
  else if (t == 12) { c = mix(vec3(.40,.56,.86), vec3(.62,.78,1.), stroke); emis = .15; }
  c *= vTint;
  c *= .88 + .24 * blot;
  // painterly light: wrapped sun, cool sky fill, warm bounce from below
  float nd = dot(n, uSun);
  float sun = clamp((nd + .3) / 1.3, 0., 1.);
  sun = smoothstep(0., 1., sun);
  vec3 sky = mix(vec3(.62,.50,.56), vec3(.55,.70,.95), n.y*.5+.5);
  vec3 light = sky * .62 + vec3(1.05,.90,.72) * sun * .62;
  float ao = top ? 1. : (bot ? .62 : mix(.72, 1., smoothstep(-.5, .45, vL.y)));
  c *= light * ao;
  c *= 1. - edge * .28;
  if (top) c += edge * .06 * vec3(1.,.95,.85);
  // sheen
  vec3 v = normalize(uCam - vW); vec3 hv = normalize(v + uSun);
  c += spec * pow(max(dot(n, hv), 0.), 24.) * .35;
  c = mix(c, c * 1.6 + vec3(.15,.08,.04) * emis, emis);
  // painterly posterise of the luminance, very light touch
  float l = dot(c, vec3(.3,.59,.11)); float lq = floor(l * 9. + .5) / 9.;
  c *= mix(1., lq / max(l, .001), .25);
  float d = length(vW - uCam);
  float f = 1. - exp(-pow(d * uFogD, 1.5));
  vec3 fogc = mix(uFog, vec3(.70,.80,.95), clamp((vW.y - uCam.y) * .02 + .3, 0., 1.));
  gl_FragColor = vec4(mix(c, fogc, f), 1.);
}`;

export const blockMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: blockVS, fragmentShader: blockFS });

const cube = new THREE.BoxGeometry(1, 1, 1);
export function makeInst(cap) {
  const geo = cube.clone();
  const mesh = new THREE.InstancedMesh(geo, blockMat, cap);
  geo.setAttribute('aType', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3));
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
const _m = new THREE.Matrix4();
export function setInst(mesh, i, x, y, z, type, tint = 1, s = 1, rot = null) {
  if (rot) _m.makeRotationFromEuler(rot).scale(new THREE.Vector3(s, s, s)).setPosition(x, y, z);
  else _m.makeScale(s, s, s).setPosition(x, y, z);
  mesh.instanceMatrix.array.set(_m.elements, i * 16);
  mesh.geometry.attributes.aType.array[i] = type;
  const a = mesh.geometry.attributes.aTint.array; a[i * 3] = tint; a[i * 3 + 1] = tint; a[i * 3 + 2] = tint * (0.97 + 0.03 * tint);
}
export function flush(mesh) {
  mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.aType.needsUpdate = true; mesh.geometry.attributes.aTint.needsUpdate = true;
}

// Sky dome: gradient + painted clouds + sun glow
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uFog; varying vec3 vD; ${NOISE}
    void main(){ vec3 d = normalize(vD); float y = d.y;
      vec3 c = mix(uFog, vec3(.60,.76,.94), smoothstep(-.02, .28, y));
      c = mix(c, vec3(.34,.52,.84), smoothstep(.3, .95, y));
      float s = max(dot(d, uSun), 0.);
      c += vec3(1.,.82,.6) * (pow(s, 6.) * .25 + pow(s, 400.) * 1.2);
      if (y > 0.) { vec2 q = d.xz / (y + .12) * 1.4 + vec2(uTime * .01, 0.);
        float cl = fbm(vec3(q, 1.)) + .5 * fbm(vec3(q * 3., 2.)) - .65;
        float a = smoothstep(.0, .35, cl) * smoothstep(0., .25, y);
        vec3 cc = mix(vec3(.98,.86,.82), vec3(1.,.98,.94), smoothstep(.1,.6,cl)) ;
        cc = mix(cc, cc * vec3(.86,.84,.95), smoothstep(.3,.0, cl - .1));
        c = mix(c, cc, a * .9); }
      gl_FragColor = vec4(c, 1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), m);
  sky.renderOrder = -10; sky.frustumCulled = false;
  return sky;
}

// The sea of clouds below the course
export function makeCloudSea() {
  const m = new THREE.ShaderMaterial({
    uniforms: U, transparent: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCam; uniform vec3 uFog; uniform vec3 uSun; varying vec3 vW; ${NOISE}
    void main(){ vec2 q = vW.xz * .045; float f = fbm(vec3(q + vec2(uTime*.02, uTime*.012), uTime * .03));
      float g = fbm(vec3(q * 3.1 - vec2(uTime * .03, 0.), 5.));
      vec3 c = mix(vec3(.80,.74,.86), vec3(1.,.95,.90), smoothstep(.3,.75, f + g*.3));
      c += vec3(1.,.8,.6) * smoothstep(.62,.9,f) * .12;
      float d = length(vW.xz - uCam.xz);
      gl_FragColor = vec4(mix(c, uFog, smoothstep(40., 260., d)), 1.); }`,
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), m);
  p.rotation.x = -Math.PI / 2; p.position.y = -14;
  return p;
}

// Gem: faceted crystal with rim light
export const gemMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uCam; uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vW;
  void main(){ vec3 n = normalize(vN); vec3 v = normalize(uCam - vW);
    float rim = pow(1. - max(dot(n, v), 0.), 2.);
    vec3 c = mix(vec3(.30,.85,.80), vec3(.65,1.,.85), n.y*.5+.5);
    c += vec3(1.) * pow(max(dot(n, normalize(v + uSun)), 0.), 30.);
    c += rim * vec3(.8,1.,.95) * .8;
    gl_FragColor = vec4(c, 1.); }`,
});

// Goal beacon light pillar
export const beamMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float a = (1. - vUv.y) * .5 * (.7 + .3 * sin(vUv.y * 30. - uTime * 4.));
    gl_FragColor = vec4(vec3(1.,.85,.5) * a, a); }`,
});
