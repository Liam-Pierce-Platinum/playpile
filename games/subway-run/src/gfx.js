// Graffiti cel look: spray-grain toon bands, halftone shadows, hard rim, ink outlines, canvas spray textures.
import * as THREE from '../vendor/three.module.js';

export const U = {
  L: { value: new THREE.Vector3(0.45, 0.8, 0.42).normalize() },
  fogCol: { value: new THREE.Color('#ff8f73') },
  fogR: { value: new THREE.Vector2(55, 165) },
  shade: { value: new THREE.Color('#5a3c95') },
  rimCol: { value: new THREE.Color('#ffd98a') },
};

const VS = `varying vec3 vN; varying vec2 vUv; varying vec3 vW; varying float vD;
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal);
vec4 mv=viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv; }`;
const FS = `uniform sampler2D map; uniform float useMap, emis; uniform vec3 tint, shade, fogCol, L, rimCol; uniform vec2 fogR;
varying vec3 vN; varying vec2 vUv; varying vec3 vW; varying float vD;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec3 base = tint; if (useMap > 0.5) base *= texture2D(map, vUv).rgb;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float d = dot(N, L);
  float g = h(floor(gl_FragCoord.xy*0.5)) - 0.5;
  float t = d + g*0.34;
  vec3 col;
  if (t > 0.38) col = base*1.06;
  else if (t > -0.08) col = base*mix(shade, vec3(1.0), 0.62);
  else { col = base*mix(shade, vec3(1.0), 0.3); vec2 c = fract(gl_FragCoord.xy/5.0)-0.5; if (length(c) < 0.25) col *= 0.7; }
  vec3 V = normalize(cameraPosition - vW);
  float rim = 1.0 - max(dot(N, V), 0.0);
  col += rimCol * step(0.72, rim + g*0.12) * 0.25 * max(d + 0.3, 0.0);
  col = mix(col, base*1.55, emis);
  col = mix(col, fogCol, smoothstep(fogR.x, fogR.y, vD));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function toon(color = '#fff', map = null, emis = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, useMap: { value: map ? 1 : 0 }, emis: { value: emis }, tint: { value: new THREE.Color(color) },
      shade: U.shade, fogCol: U.fogCol, L: U.L, rimCol: U.rimCol, fogR: U.fogR },
    vertexShader: VS, fragmentShader: FS,
  });
}

const OVS = `uniform float thick, mode; varying float vD;
void main(){ vec3 off = mode > 0.5 ? sign(position)*thick : normalize(normal)*thick;
vec4 mv = modelViewMatrix*vec4(position+off,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }`;
const OFS = `uniform vec3 ink, fogCol; uniform vec2 fogR; varying float vD;
void main(){ gl_FragColor = vec4(mix(ink, fogCol, smoothstep(fogR.x, fogR.y, vD)), 1.0);
#include <colorspace_fragment>
}`;
const oCache = {};
export function addOutline(mesh, thick = 0.05, mode = 0) {
  const k = thick + ':' + mode;
  const mat = oCache[k] || (oCache[k] = new THREE.ShaderMaterial({
    uniforms: { thick: { value: thick }, mode: { value: mode }, ink: { value: new THREE.Color('#170c22') }, fogCol: U.fogCol, fogR: U.fogR },
    vertexShader: OVS, fragmentShader: OFS, side: THREE.BackSide }));
  const o = new THREE.Mesh(mesh.geometry, mat); o.raycast = () => {}; mesh.add(o); return o;
}

export function makeSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color('#2b1655') }, mid: { value: new THREE.Color('#c2397a') }, hor: U.fogCol,
      sun: { value: new THREE.Color('#ffe9a8') }, sunDir: { value: new THREE.Vector3(0.15, 0.13, -1).normalize() } },
    vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, hor, sun, sunDir; varying vec3 vP;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){ float g = h(floor(gl_FragCoord.xy*0.5)) - 0.5; float t = vP.y + g*0.05;
  vec3 c = t > 0.22 ? mix(mid, top, smoothstep(0.22, 0.65, t)) : mix(hor, mid, smoothstep(0.0, 0.22, t));
  float s = dot(vP, sunDir);
  float band = step(0.5, fract(vP.y*38.0)) * step(vP.y, sunDir.y) ;
  float disc = smoothstep(0.986, 0.989, s + g*0.004) * (1.0 - band*0.8);
  c = mix(c, sun, disc); c += sun*pow(max(s,0.0), 30.0)*0.35;
  float cl = step(0.62, fract(sin(floor(atan(vP.x, -vP.z)*9.0))*91.7)) * smoothstep(0.08, 0.1, vP.y) * smoothstep(0.2, 0.17, vP.y);
  c = mix(c, mid*0.75, cl*0.45*(0.6+g));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`, side: THREE.BackSide, depthWrite: false });
  const s = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), m); s.renderOrder = -1; return s;
}

// ---------- spray-paint canvas textures ----------
const R = Math.random;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function spray(g, x, y, r, col, n = 220) { g.fillStyle = col; for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.pow(R(), 1.5) * r; g.globalAlpha = 0.1 + R() * 0.5; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 1.6); } g.globalAlpha = 1; }
function grain(g, w, h, amt = 0.09) { const id = g.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 255 * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0); }
const WORDS = ['DASH', 'VYBE', 'NOVA', 'BLITZ', 'RUSH', 'KILO', 'ZEST', 'MOJO', 'FLUX', 'RAZE', 'HYPE', 'ZOOM'];
const PAL = [['#ff3d7f', '#ffd23f'], ['#3df2ff', '#7b2dff'], ['#9dff3d', '#ff7a1a'], ['#ffe14d', '#ff2d55'], ['#ff8ad8', '#2de2a6']];
const FONT = (s) => `900 ${s}px "Arial Black", Impact, sans-serif`;
function piece(g, x, y, size, word = WORDS[(R() * WORDS.length) | 0]) {
  const [a, b] = PAL[(R() * PAL.length) | 0];
  g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.16);
  g.font = FONT(size); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const wv = g.measureText(word).width;
  for (let i = 0; i < 4; i++) spray(g, (R() - 0.5) * wv, (R() - 0.5) * size, size * 0.9, b, 260);
  g.strokeStyle = '#140a1e'; g.lineWidth = size * 0.34; g.strokeText(word, size * 0.07, size * 0.09);
  g.strokeStyle = '#fff'; g.lineWidth = size * 0.17; g.strokeText(word, 0, 0);
  const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, a); gr.addColorStop(0.55, a); gr.addColorStop(0.56, b); gr.addColorStop(1, b);
  g.fillStyle = gr; g.fillText(word, 0, 0);
  g.fillStyle = b; for (let i = 0; i < 7; i++) { const dx = (R() - 0.5) * wv * 0.9, len = size * (0.15 + R() * 0.6); g.fillRect(dx, size * 0.28, 3, len); g.beginPath(); g.arc(dx + 1.5, size * 0.28 + len, 3.2, 0, 7); g.fill(); }
  g.fillStyle = '#ffffffd0'; for (let i = 0; i < 6; i++) g.fillRect((R() - 0.5) * wv * 0.9, -size * 0.32 + R() * 5, size * 0.13, size * 0.05);
  g.restore();
}
function tag(g, x, y, col) { g.strokeStyle = col; g.lineWidth = 2.5 + R() * 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 6; i++) g.quadraticCurveTo(x + R() * 30, y - 20 + R() * 40, x += 8 + R() * 14, y + (R() - 0.5) * 16); g.stroke(); }

function trainSide(base) {
  const [c, g] = cv(1024, 256);
  g.fillStyle = base; g.fillRect(0, 0, 1024, 256);
  const sh = g.createLinearGradient(0, 0, 0, 256); sh.addColorStop(0, '#ffffff30'); sh.addColorStop(0.5, '#00000000'); sh.addColorStop(1, '#00000070'); g.fillStyle = sh; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#00000040'; for (let x = 0; x < 1024; x += 128) g.fillRect(x, 0, 3, 230);
  for (let x = 40; x < 1000; x += 150) { g.fillStyle = '#1b1430'; g.fillRect(x, 28, 96, 62); g.fillStyle = '#7fd7ff55'; g.beginPath(); g.moveTo(x + 10, 88); g.lineTo(x + 44, 30); g.lineTo(x + 62, 30); g.lineTo(x + 28, 88); g.fill(); }
  g.fillStyle = '#2a2236'; g.fillRect(470, 24, 90, 206); g.fillStyle = '#ffffff22'; g.fillRect(513, 24, 4, 206);
  for (let i = 0; i < 2; i++) piece(g, 230 + i * 560 + (R() - 0.5) * 60, 150 + (R() - 0.5) * 20, 88 + R() * 26);
  for (let i = 0; i < 6; i++) tag(g, R() * 980, 40 + R() * 180, ['#fff', '#111', '#ffd23f', '#3df2ff'][(R() * 4) | 0]);
  g.fillStyle = '#17121f'; g.fillRect(0, 226, 1024, 30);
  g.fillStyle = '#3a3346'; for (const x of [90, 220, 800, 930]) { g.beginPath(); g.arc(x, 246, 24, 0, 7); g.fill(); }
  grain(g, 1024, 256); return tex(c);
}
function trainFront(base) {
  const [c, g] = cv(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#140f22'; g.beginPath(); g.roundRect(26, 30, 204, 92, 14); g.fill();
  g.fillStyle = '#9fe3ff44'; g.beginPath(); g.moveTo(50, 118); g.lineTo(120, 34); g.lineTo(150, 34); g.lineTo(80, 118); g.fill();
  g.fillStyle = '#ffffffaa'; g.font = FONT(30); g.textAlign = 'center'; g.fillText(String(10 + ((R() * 89) | 0)), 128, 160);
  g.fillStyle = '#fff4b0'; for (const x of [52, 204]) { g.beginPath(); g.arc(x, 196, 17, 0, 7); g.fill(); spray(g, x, 196, 30, '#fff4b0', 120); }
  g.fillStyle = '#ffd23f'; for (let x = -20; x < 256; x += 40) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 20, 226); g.lineTo(x + 40, 226); g.lineTo(x + 20, 256); g.fill(); }
  tag(g, 140, 100, '#fff'); grain(g, 256, 256); return tex(c);
}
function wall() {
  const [c, g] = cv(1024, 256);
  g.fillStyle = '#5c5873'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#47435d'; g.lineWidth = 2;
  for (let y = 0; y < 256; y += 22) for (let x = (y / 22) % 2 ? 0 : 24; x < 1024; x += 48) g.strokeRect(x, y, 48, 22);
  for (let i = 0; i < 10; i++) { g.fillStyle = '#2a2638' + '40'; g.fillRect(R() * 1024, 0, 6 + R() * 12, 80 + R() * 170); }
  for (let i = 0; i < 3; i++) { const x = R() * 900; g.fillStyle = ['#f2e8c9', '#ffd23f', '#3df2ff'][i]; g.fillRect(x, 40 + R() * 60, 70, 96); g.fillStyle = '#00000088'; for (let k = 0; k < 5; k++) g.fillRect(x + 8, 56 + k * 14 + 40, 54, 5); }
  for (let i = 0; i < 3; i++) piece(g, 150 + i * 340 + (R() - 0.5) * 80, 150 + (R() - 0.5) * 40, 80 + R() * 40);
  for (let i = 0; i < 10; i++) tag(g, R() * 1000, 30 + R() * 200, ['#fff', '#111', '#ff3d7f', '#9dff3d'][(R() * 4) | 0]);
  grain(g, 1024, 256, 0.12); return tex(c);
}
function ground() {
  const [c, g] = cv(512, 256); const px = 512 / 12;
  g.fillStyle = '#4a3f4f'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 5000; i++) { g.fillStyle = ['#5d5163', '#3a3140', '#6e6070', '#2f2834'][(R() * 4) | 0]; g.fillRect(R() * 512, R() * 256, 2 + R() * 3, 2 + R() * 3); }
  for (const lx of [-2.4, 0, 2.4]) {
    const cx = (lx + 6) * px;
    for (let z = 0; z < 6; z += 1.5) { g.fillStyle = '#3b2a22'; g.fillRect(cx - 1.15 * px, z * px + 10, 2.3 * px, 14); g.fillStyle = '#5a4033'; g.fillRect(cx - 1.15 * px, z * px + 10, 2.3 * px, 4); }
    for (const s of [-0.72, 0.72]) { g.fillStyle = '#1e1a24'; g.fillRect(cx + s * px - 4, 0, 8, 256); g.fillStyle = '#c9c2d6'; g.fillRect(cx + s * px - 3, 0, 3, 256); }
  }
  grain(g, 512, 256, 0.06); const t = tex(c, true); return t;
}
function stripes(a, b) {
  const [c, g] = cv(128, 64); g.fillStyle = a; g.fillRect(0, 0, 128, 64); g.fillStyle = b;
  for (let x = -64; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 16, 64); g.lineTo(x + 80, 0); g.lineTo(x + 64, 0); g.fill(); }
  for (let i = 0; i < 6; i++) spray(g, R() * 128, R() * 64, 14, '#00000055', 60);
  grain(g, 128, 64, 0.1); return tex(c);
}
function windows() {
  const [c, g] = cv(128, 128); g.fillStyle = '#3a2a5c'; g.fillRect(0, 0, 128, 128);
  for (let y = 6; y < 128; y += 16) for (let x = 6; x < 128; x += 16) { g.fillStyle = R() < 0.35 ? ['#ffcf6b', '#ff9e5e', '#ffe9a8'][(R() * 3) | 0] : '#241a3a'; g.fillRect(x, y, 9, 10); }
  grain(g, 128, 128, 0.08); return tex(c, true);
}
function dot() {
  const [c, g] = cv(64, 64); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.5, '#ffffffaa'); r.addColorStop(1, '#ffffff00');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); spray(g, 32, 32, 30, '#fff', 300); const t = new THREE.CanvasTexture(c); return t;
}
export function textures() {
  const bases = ['#1fb5a8', '#e8b52a', '#c43d78', '#9aa3b8'];
  return {
    trainSide: bases.map(trainSide), trainFront: bases.map(trainFront), wall: [wall(), wall(), wall()],
    ground: ground(), stripe: stripes('#f4efe4', '#e8343f'), stripeY: stripes('#ffd23f', '#1b1424'), windows: windows(), dot: dot(),
  };
}
