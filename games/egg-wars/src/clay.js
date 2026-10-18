// Stop-motion clay material: fingerprint whorls + lumpy bump, mottled tint, 12fps vertex "boil",
// and (eggs only) procedural shell cracks driven by uCrack. Built on MeshPhysicalMaterial (sheen = soft clay).
import * as THREE from '../vendor/three.module.js';
export const clayUniforms = { uTime: { value: 0 } };
const NOISE = `
float h31(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return vn(p)*.5+vn(p*2.03)*.25+vn(p*4.1)*.125;}
`;
const FRAG = `
uniform float uCrack; uniform float uBump; uniform float uTime; varying vec3 vClayP;
float gH; float gCrack;
float printP(vec3 p){ vec3 c=floor(p*3.0); vec3 f=fract(p*3.0)-0.5; vec3 o=vec3(h31(c),h31(c+5.),h31(c+9.))-0.5;
  vec3 d=(f-o*0.35)*vec3(1.0,1.35,0.85); float r=length(d);
  float ridge=sin(r*95.0+fbm(p*7.0)*5.0)*0.5+0.5;
  return ridge*smoothstep(0.30,0.12,r)*step(0.4,h31(c+7.));}
#ifdef CLAY_CRACK
float vor(vec3 p){ vec3 i=floor(p),f=fract(p); float d1=8.,d2=8.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 g=vec3(x,y,z);
    vec3 o=vec3(h31(i+g),h31(i+g+17.),h31(i+g+31.)); float d=length(g+o-f);
    if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
  return d2-d1;}
#endif
`;
export function clayMat(color, { boil = 0.006, crack = false, bump = 1, rough = 0.8 } = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, metalness: 0, sheen: 0.7, sheenRoughness: 0.7, sheenColor: c.clone().lerp(new THREE.Color(1, 0.95, 0.85), 0.6) });
  const u = { uCrack: { value: 0 }, uBoil: { value: boil }, uBump: { value: bump } };
  m.userData.u = u;
  if (crack) m.defines = { CLAY_CRACK: '' };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u, clayUniforms);
    s.vertexShader = 'uniform float uTime; uniform float uBoil; varying vec3 vClayP;\n' + NOISE + s.vertexShader.replace('#include <begin_vertex>',
      `vec3 transformed = position; vClayP = position; float st = floor(uTime*12.0)*1.7; vec3 bp = position*3.0+st;
       transformed += (vec3(vn(bp), vn(bp+11.0), vn(bp+23.0))-0.5)*uBoil;`);
    s.fragmentShader = NOISE + FRAG + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 P = vClayP; float fw = length(fwidth(P));
        float pr = printP(P) * (1.0 - smoothstep(0.004, 0.014, fw));
        gH = fbm(P*2.2)*0.035 + pr*0.0022 + vn(P*38.0)*0.0015*(1.0-smoothstep(0.01,0.03,fw));
        diffuseColor.rgb *= 0.88 + 0.22*fbm(P*2.7+3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.06,0.97,0.9), vn(P*1.3));
        diffuseColor.rgb *= 1.0 - pr*0.06;
        gCrack = 0.0;
        #ifdef CLAY_CRACK
        if (uCrack > 0.01) { float e = vor(P*3.2); float mask = step(fbm(P*1.4+5.0), uCrack*0.95);
          gCrack = (1.0 - smoothstep(0.015, 0.06, e)) * mask;
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.95,0.72,0.2), vec3(0.12,0.07,0.03), smoothstep(0.03,0.0,e)), gCrack);
          gH -= gCrack*0.012; }
        #endif
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition); float hh = gH*uBump;
          float dhx = dFdx(hh), dhy = dFdy(hh); vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1); vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          normal = normalize(abs(det)*normal - grad); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor - 0.12*vn(vClayP*9.0), 0.4, 1.0);');
  };
  m.customProgramCacheKey = () => (crack ? 'clayC' : 'clay');
  return m;
}
// Rounded box with edge-clustered segments so corners are smooth.
export function roundedBox(w, h, d, r, seg = 3) {
  const n = 2 * seg + 1, g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal, half = [w / 2, h / 2, d / 2];
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), o = new THREE.Vector3();
  const remap = (u, hf) => { const i = Math.round((u + 0.5) * n); if (i <= seg) return -hf + r * (i / seg); return hf - r * ((n - i) / seg); };
  for (let k = 0; k < pos.count; k++) {
    v.set(remap(pos.getX(k), half[0]), remap(pos.getY(k), half[1]), remap(pos.getZ(k), half[2]));
    inner.set(Math.max(-half[0] + r, Math.min(half[0] - r, v.x)), Math.max(-half[1] + r, Math.min(half[1] - r, v.y)), Math.max(-half[2] + r, Math.min(half[2] - r, v.z)));
    o.copy(v).sub(inner); const L = o.length();
    if (L > 1e-6) { o.multiplyScalar(1 / L); v.copy(inner).addScaledVector(o, r); nor.setXYZ(k, o.x, o.y, o.z); }
    pos.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
