// The sea. One big plane whose height IS the tide; depth, foam and the
// lighthouse beam spot are all worked out per pixel from the baked heights.
import * as THREE from 'three';

const vert = /* glsl */`
uniform float uTime, uLevel, uAmp;
varying vec3 vW;
float wave(vec2 p){
  return sin(p.x*0.35+uTime*1.1)*0.05 + sin(p.y*0.42-uTime*0.9)*0.05 + sin((p.x+p.y)*0.8+uTime*1.7)*0.025;
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = uLevel + wave(w.xz) * uAmp;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */`
uniform sampler2D uH, uHF;
uniform vec3 uRect, uRectF;
uniform float uTime, uLevel, uBeamOn, uBeamR, uChop;
uniform vec3 uShallow, uDeep, uFoam, uSky, uSunCol, uSunDir, uFogColor;
uniform vec2 uBeam;
uniform float uFogNear, uFogFar;
varying vec3 vW;
float hAt(vec2 p){
  vec2 uv = (p - uRect.xy) / uRect.z;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) return texture2D(uH, uv).r * 8.0 - 6.0;
  vec2 uf = (p - uRectF.xy) / uRectF.z;
  if (uf.x < 0.0 || uf.y < 0.0 || uf.x > 1.0 || uf.y > 1.0) return -5.0;
  return texture2D(uHF, uf).r * 8.0 - 6.0;
}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y);
}
void main(){
  float depth = vW.y - hAt(vW.xz);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 3.2, depth));
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if (n.y < 0.0) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col = mix(col, uSky, fres * 0.45);
  vec3 H = normalize(uSunDir + V);
  col += uSunCol * pow(max(dot(n, H), 0.0), 90.0) * 0.55;
  float nz = noise(vW.xz * 1.3 + vec2(uTime * 0.25, uTime * 0.18));
  float band = 1.0 - smoothstep(0.0, 0.17, depth + (nz - 0.5) * 0.1);
  float lines = smoothstep(0.62, 0.7, fract(depth * 2.0 - uTime * 0.32 + nz * 0.45)) * smoothstep(0.12, 0.3, depth) * (1.0 - smoothstep(0.3, 1.0, depth));
  float speck = step(0.93 - uChop * 0.08, noise(vW.xz * 2.6 - uTime * 0.2)) * (0.35 + uChop * 0.3);
  float caps = smoothstep(0.4, 1.0, uChop) * step(0.88, noise(vW.xz * 0.8 + vec2(uTime * 0.6, -uTime * 0.4))) * 0.55;
  float foam = clamp(band + lines * 0.55 + speck * (1.0 - smoothstep(0.5, 2.5, depth)) + caps, 0.0, 1.0);
  col = mix(col, uFoam, foam);
  float bd = distance(vW.xz, uBeam);
  col += vec3(1.0, 0.88, 0.55) * uBeamOn * (1.0 - smoothstep(uBeamR * 0.3, uBeamR, bd)) * 0.75;
  float alpha = mix(0.5, 0.985, smoothstep(0.0, 2.6, depth));
  alpha = max(alpha, foam * 0.95);
  float fd = length(vW - cameraPosition);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, fd));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export function buildWater(heightTex, farTex) {
  const geo = new THREE.PlaneGeometry(420, 420, 210, 210);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uH: { value: heightTex.tex }, uRect: { value: heightTex.rect },
      uHF: { value: farTex.tex }, uRectF: { value: farTex.rect },
      uTime: { value: 0 }, uLevel: { value: 0 }, uAmp: { value: 1 }, uChop: { value: 0 },
      uShallow: { value: new THREE.Color('#62d9cb') }, uDeep: { value: new THREE.Color('#1c78b0') },
      uFoam: { value: new THREE.Color('#ffffff') }, uSky: { value: new THREE.Color('#bfe6f5') },
      uSunCol: { value: new THREE.Color('#fff3dc') }, uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
      uFogColor: { value: new THREE.Color('#bfe6f5') }, uFogNear: { value: 90 }, uFogFar: { value: 210 },
      uBeam: { value: new THREE.Vector2() }, uBeamOn: { value: 0 }, uBeamR: { value: 6 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.position.set(10, 0, 20);
  return mesh;
}
