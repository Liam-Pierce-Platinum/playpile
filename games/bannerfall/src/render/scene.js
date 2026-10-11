// BANNERFALL :: render/scene.js - renderer, the sun (or moon), soft shadows, sky dome and fog.
// applyEnv() re-lights the scene for each battlefield's biome (data/envs.js).
import * as THREE from '../../vendor/three.module.js';

export const PAL = {
  blue: 0x2f5fa8, gold: 0xe2b33c, red: 0xa82f2f, iron: 0x2a2326,
  robe: 0xefe6d2, glow: 0xc8ff9a, glowRim: 0xffe28a,
  fog: 0xd9c6a5, skyHorizon: 0xf2c58a, skyZenith: 0x8fb2d6,
};

export function sunVector(az, el) {
  // azimuth: degrees from north (+z) toward east (+x); the vector points TO the sun
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

export function createScene(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowfx, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  let quality = opts.lowfx ? 'low' : 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.fog);
  scene.fog = new THREE.FogExp2(PAL.fog, 0.0032);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1400);

  // warm low sun from the south-west (DESIGN.md 8.2), long raking shadows
  const sunDir = new THREE.Vector3(-0.62, 0.46, -0.64).normalize();
  const sun = new THREE.DirectionalLight(0xffdcaa, 3.1);
  sun.castShadow = true;
  const SH = quality === 'low' ? 1024 : 4096;
  sun.shadow.mapSize.set(SH, SH);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xc4d8ee, 0x7a6644, 1.45);
  scene.add(hemi);
  // a soft cool fill opposite the sun so shadow sides keep their colour
  const fill = new THREE.DirectionalLight(0x9fb8e0, 0.35);
  fill.position.set(0.6, 0.5, 0.7);
  scene.add(fill);

  // sky dome: horizon glow, zenith blue, a big soft sun disc and painted cloud bands; stars at night
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() }, uTime: { value: 0 }, uClouds: { value: 0.75 }, uNight: { value: 0 },
      uHor: { value: new THREE.Color(PAL.skyHorizon) }, uZen: { value: new THREE.Color(PAL.skyZenith) }, uFog: { value: new THREE.Color(PAL.fog) }, uSunCol: { value: new THREE.Color(1, 0.82, 0.55) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }`,
    fragmentShader: `
      uniform vec3 uSun, uHor, uZen, uFog, uSunCol; uniform float uTime, uClouds, uNight; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHor, uZen, pow(smoothstep(0.0, 0.75, y), 0.7));
        col = mix(uFog, col, smoothstep(-0.05, 0.12, y));
        float sd = max(dot(d, uSun), 0.0);
        if (uNight > 0.5) {
          // stars and a cool moon
          vec2 sp = d.xz / (d.y + 0.3) * 60.0;
          float st = step(0.996, h(floor(sp))) * smoothstep(0.05, 0.4, y) * (0.6 + 0.4 * sin(uTime * 2.0 + h(floor(sp)) * 40.0));
          col += vec3(0.85, 0.9, 1.0) * st;
          col += vec3(0.6, 0.7, 1.0) * (pow(sd, 30.0) * 0.25) + vec3(0.95, 0.97, 1.0) * smoothstep(0.9992, 0.9996, sd) * 1.2;
        } else {
          col += uSunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6 + smoothstep(0.9985, 0.9995, sd) * 1.6);
        }
        // painted clouds
        vec2 cp = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
        float c = smoothstep(0.62 - uClouds * 0.14, 0.86 - uClouds * 0.1, fbm(cp));
        vec3 cloud = uNight > 0.5 ? vec3(0.22, 0.26, 0.38) : mix(vec3(1.0, 0.95, 0.88), uSunCol * 1.15, pow(sd, 3.0));
        cloud = mix(cloud, uHor * 1.05, 0.25);
        col = mix(col, cloud, c * smoothstep(0.02, 0.25, y) * (0.45 + uClouds * 0.4));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  function applyEnv(E) {
    const v = sunVector(E.sun[0], E.sun[1]);
    sunDir.copy(v);
    skyMat.uniforms.uSun.value.copy(v);
    sun.color.set(E.sun[2]); sun.intensity = E.sun[3];
    hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity = E.hemi[2];
    fill.color.set(E.fill[0]); fill.intensity = E.fill[1];
    fill.position.set(-v.x, 0.5, -v.z);
    scene.fog.color.set(E.fog); scene.fog.density = E.fogD;
    scene.background.set(E.fog);
    skyMat.uniforms.uHor.value.set(E.sky[0]); skyMat.uniforms.uZen.value.set(E.sky[1]); skyMat.uniforms.uFog.value.set(E.fog);
    skyMat.uniforms.uSunCol.value.set(E.sun[2]).multiplyScalar(0.85);
    skyMat.uniforms.uClouds.value = E.clouds ?? 0.75;
    skyMat.uniforms.uNight.value = E.night ? 1 : 0;
    renderer.toneMappingExposure = E.exposure || 1;
  }

  const size = { w: 1, h: 1 };
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (w === size.w && h === size.h) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // fit the shadow frustum around what the camera looks at so shadows stay crisp
  function fitShadow(target, dist) {
    const r = Math.min(260, Math.max(40, dist * 1.25));
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.updateProjectionMatrix();
    // snap to texels to stop shimmer
    const texel = (2 * r) / sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
    sun.target.position.set(tx, target.y, tz);
    sun.position.set(tx + sunDir.x * 300, target.y + sunDir.y * 300, tz + sunDir.z * 300);
    sun.shadow.bias = -0.0002 - r * 0.0000025;
  }

  function setQuality(q) {
    if (q === quality) return;
    quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : 1.75));
    const S = q === 'low' ? 1024 : 4096;
    sun.shadow.mapSize.set(S, S);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    size.w = 0; resize();
  }

  // extra passes after the world (builder D: the first-person arms and weapon, drawn over a
  // cleared depth buffer): passes.push((renderer) => { renderer.clearDepth(); renderer.render(vmScene, vmCam); })
  const passes = [];
  function render(t, overrideScene, overrideCam) {
    resize();
    skyMat.uniforms.uTime.value = t;
    sky.position.copy(camera.position);
    renderer.render(overrideScene || scene, overrideCam || camera);
    if (passes.length && !overrideScene) { const ac = renderer.autoClear; renderer.autoClear = false; for (const p of passes) p(renderer, t); renderer.autoClear = ac; }
  }
  // first person (builder D): a tight, sharp shadow box around the eye instead of the RTS fit
  let shadowMode = 'rts';
  function setShadowMode(m) { shadowMode = m; }
  function fitShadowFP(eye) {
    const r = 34, c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.updateProjectionMatrix();
    const texel = (2 * r) / sun.shadow.mapSize.x;
    const tx = Math.round(eye.x / texel) * texel, tz = Math.round(eye.z / texel) * texel;
    sun.target.position.set(tx, eye.y, tz);
    sun.position.set(tx + sunDir.x * 200, eye.y + sunDir.y * 200, tz + sunDir.z * 200);
    sun.shadow.bias = -0.00015;
  }

  return { renderer, scene, camera, sun, sunDir, hemi, fill, sky, render, resize, fitShadow: (t, d) => (shadowMode === 'fps' ? fitShadowFP(camera.position) : fitShadow(t, d)), size, applyEnv, setQuality, quality: () => quality, passes, setShadowMode };
}
