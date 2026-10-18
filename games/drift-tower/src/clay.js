// Soft clay material: matte standard + world-space thumbprint grain, baked vertex AO, warm rim light.
import * as THREE from '../vendor/three.module.js';

export function clayMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, vertexColors: true, ...opts });
  const rim = new THREE.Color(opts.rimColor || 0xfff1e6);
  m.onBeforeCompile = (s) => {
    s.uniforms.uRim = { value: rim };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; uniform vec3 uRim;
float h3(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
 float g = vn(vWP*7.0)*0.6 + vn(vWP*19.0)*0.4;
 float ring = sin(length(vWP.xz*3.1)+vn(vWP*2.0)*6.0)*0.5+0.5;
 diffuseColor.rgb *= 0.95 + 0.07*g + 0.025*ring;`)
      .replace('#include <opaque_fragment>', `
 float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)),0.0,1.0), 2.6);
 outgoingLight += uRim * fr * 0.22;
 outgoingLight = mix(vec3(dot(outgoingLight,vec3(.333))), outgoingLight, 0.92) * 1.02;
#include <opaque_fragment>`);
  };
  return m;
}

// Pebble-rounded box with vertex AO (bottom darker, top lit).
export function roundBox(w, h, d, r = 0.15, seg = 5, aoLow = 0.62) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-8) { dlt.normalize(); v.copy(c).addScaledVector(dlt, r); n.setXYZ(i, dlt.x, dlt.y, dlt.z); }
    p.setXYZ(i, v.x, v.y, v.z);
    const t = (v.y + h / 2) / h, a = aoLow + (1 - aoLow) * Math.pow(t, 0.7);
    col.push(a, a, a);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function aoGeo(g, aoLow = 0.65) {
  g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - b.min.y) / Math.max(1e-4, b.max.y - b.min.y); const a = aoLow + (1 - aoLow) * t; col.push(a, a, a); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
