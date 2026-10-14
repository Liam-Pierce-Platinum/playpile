// Everything about how the night looks: renderer, fog, sky, the city reflection probe, light
// pools (forward rendering pays per light, so hundreds of virtual lights share a small fixed pool
// of real ones, Rain City style), wet-street planar reflections, rain, and the post chain:
// bloom -> SMAA -> grade (chromatic aberration, vignette, grain, fear desaturation, flash).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { gltf, hdr, setAnisotropy } from './assets.js';
import { makePuddleTexture, Ripples, wetUniforms, PlanarReflection, reflectionOverlay, LAYER_REFLECTOR, LAYER_RAIN } from './wet.js';
import { buildWorld, CURB } from './world.js';
import { placeFurniture, flicker } from './furniture.js';
import { Rain } from './rain.js';
import { makeSky } from './atmos.js';
import { LightPool } from './lightpool.js';
import { Glows } from './glow.js';
import { ContactShadows } from './contact.js';
import { Props } from './props.js';
import { Nav } from './nav.js';

export const params = new URLSearchParams(location.search);

export async function createStage(onMsg = () => {}) {
  const tm = { t: 0 };
  const lowQ = params.get('q') === 'low' || (() => { try { return JSON.parse(localStorage.getItem('pd.pursued') || '{}').quality === 'low'; } catch (e) { return false; } })();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const maxDpr = parseFloat(params.get('dpr') || (lowQ ? '0.75' : '1'));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = parseFloat(params.get('exp') || '1.25');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  document.getElementById('view').appendChild(renderer.domElement);
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0.026, 0.03, 0.038);
  scene.fog = new THREE.FogExp2(FOG, 0.03);
  scene.background = FOG;
  // far plane at 80 m: the fog has eaten everything by then, and it culls most of the city per pass
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
  camera.layers.enable(LAYER_REFLECTOR);
  camera.layers.enable(LAYER_RAIN);
  scene.add(camera);

  onMsg('loading the neighbourhood');
  const names = ['street_lamp_01', 'street_lamp_02', 'metal_trash_can', 'trashbag', 'cardboard_box_01', 'crownvic_sedan', 'crownvic_wheel_sedan', 'savana_plain', 'savana_wheel', 'fire_hydrant', 'exterior_aircon_unit', 'covered_car'];
  const [envHdr, ...loaded] = await Promise.all([hdr('assets/hdri/street_night.hdr'), ...names.map(n => gltf('assets/lo/' + n + '.glb').catch(() => null))]);
  const P = {}; names.forEach((n, i) => P[n] = loaded[i]);

  envHdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envHdr).texture;
  scene.environmentIntensity = 0.2;
  const sky = makeSky(); scene.add(sky);
  const hemi = new THREE.HemisphereLight(0x3a4658, 0x1a120c, 0.34); scene.add(hemi);

  const puddleTex = makePuddleTexture();
  const ripples = new Ripples(lowQ ? 256 : 512);
  wetUniforms.tPuddle.value = puddleTex;
  wetUniforms.tRipple.value = ripples.texture;

  onMsg('building streets, alleys and yards');
  const seed = parseInt(params.get('seed') || '4417');
  const W = buildWorld(scene, { envEquirect: envHdr, puddleTex, seed });
  const glows = new Glows(scene, scene.fog);
  const contact = new ContactShadows(scene, 3000, 0.55);
  const furn = placeFurniture(scene, W, P, glows, contact);
  const props = new Props(scene, W.statics, P);
  for (const sp of W.propSpots) if (!sp.static) props.spawn(sp.type, sp.x, sp.y, sp.z, sp.rot);

  onMsg('teaching it the way round');
  const nav = new Nav(W.statics, -130, -110, 130, 110, 0.5);
  for (const d of W.doors) nav.addDoor(d, d.rect[0], d.rect[1], d.rect[2], d.rect[3], d.y);

  // ---------------- light pools ----------------
  const Q = lowQ ? { lamps: 6, shadows: 2, points: 6 } : { lamps: 9, shadows: 4, points: 9 };
  const lampPool = new LightPool(scene, Q.lamps, () => new THREE.SpotLight(0xffffff, 0, 34, 1.15, 0.8, 2), (r, v, w) => {
    r.position.copy(v.pos); r.target.position.copy(v.target); r.color.copy(v.color); r.intensity = v.intensity * w * flicker(v, tm.t);
  });
  lampPool.real.slice(0, Q.shadows).forEach(s => {
    s.castShadow = true; s.shadow.mapSize.set(1024, 1024);
    s.shadow.camera.near = 0.3; s.shadow.camera.far = 26; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03;
  });
  furn.lampVirtuals.forEach(v => lampPool.add(v));
  const pointPool = new LightPool(scene, Q.points, () => new THREE.PointLight(0xffffff, 0, 10, 2), (r, v, w) => {
    r.position.copy(v.pos); r.color.copy(v.color); r.intensity = v.intensity * w * flicker(v, tm.t); r.distance = v.distance;
  });
  W.pointVirtuals.forEach(v => pointPool.add(v));
  // a dim fill that rides with the camera: the city glow on your own surroundings, so the thing
  // is never a black hole when it is right on you
  const fill = new THREE.PointLight(0xb8c4d8, 2.2, 12, 2); camera.add(fill); fill.position.set(0, 0.3, 0.4);

  // ---------------- reflections ----------------
  const refl = new PlanarReflection(0, lowQ ? 0.25 : 0.4);
  const planeGeo = (rects, y) => {
    const pos = [], idx = [];
    for (const [x0, x1, z0, z1] of rects) { const b = pos.length / 3; pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  };
  const alleyRects = W.blocks.map(b => [b.bx0, b.bx1, b.zc - 1.8, b.zc + 1.8]);
  const roadOverlay = reflectionOverlay(refl, planeGeo(W.roadRects.concat(alleyRects), 0.002), { puddle: 0.585, wetRefl: 0.5, fog: scene.fog });
  const walkOverlay = reflectionOverlay(refl, planeGeo(W.walkRects, CURB + 0.002), { puddle: 0.64, wetRefl: 0.3, fog: scene.fog, planeY: 0 });
  scene.add(roadOverlay, walkOverlay);
  const reflOn = !lowQ && !params.has('norefl');
  roadOverlay.visible = walkOverlay.visible = reflOn;

  // ---------------- rain ----------------
  const rain = new Rain(scene, { count: lowQ ? 50000 : 100000, splashes: lowQ ? 3000 : 6000 });
  rain.uniforms.tMask.value = W.mask.tex; rain.uniforms.uMaskXf.value.copy(W.mask.xf);

  // ---------------- post ----------------
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.35, 2.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass(); if (!lowQ) composer.addPass(smaa);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uFear: { value: 0 }, uCA: { value: 0 }, uFlash: { value: 0 }, uBlack: { value: 0 }, uPulse: { value: 0 }, uTired: { value: 0 }, uRed: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uFear, uCA, uFlash, uBlack, uPulse, uTired, uRed; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        // lens + panic: chromatic aberration grows toward the edges and with fear
        float ca = 0.004 + uCA * 0.03;
        vec2 off = c * r2 * ca * 4.0;
        // a heartbeat pulse squeezes the image very slightly
        vec2 uv = vUv - c * uPulse * 0.006;
        vec3 col;
        col.r = texture2D(tDiffuse, uv - off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv + off).b;
        // ghosting when it is close
        if (uCA > 0.05) { vec3 g2 = texture2D(tDiffuse, uv + vec2(sin(uTime*23.0), cos(uTime*17.0))*0.004*uCA).rgb; col = mix(col, max(col, g2), 0.35*uCA); }
        float l = dot(col, vec3(0.299,0.587,0.114));
        col = mix(col, col*vec3(0.92,0.98,1.08), smoothstep(0.35, 0.0, l)*0.6);
        // fear drains the colour
        col = mix(col, vec3(l)*vec3(1.02,0.98,0.95), uFear*0.55);
        col = pow(col, vec3(1.04 + uFear*0.1));
        // vignette: tighter with fear and exhaustion
        float vig = mix(0.62, 0.25, clamp(uFear*0.8 + uTired*0.5, 0.0, 1.0));
        col *= mix(1.0, vig, smoothstep(0.08, 0.6, r2*1.6));
        col = mix(col, col*vec3(1.35,0.55,0.5), uRed*smoothstep(0.05, 0.45, r2*1.4));
        float g = h(vUv*uRes + fract(uTime*37.0)*100.0) - 0.5;
        col += g * (0.03 + uFear*0.03);
        col = mix(col, vec3(1.0), uFlash);
        col *= 1.0 - uBlack;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    refl.setSize(w * pr, h * pr);
    grade.uniforms.uRes.value.set(w * pr, h * pr);
  }
  addEventListener('resize', resize);
  resize();

  // ---------------- city reflection probe (glass + wet things reflect this street) ----------------
  {
    onMsg('lighting');
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(0.5, 300, cubeRT);
    cubeCam.position.set(0, 3.5, -29);
    rain.streaks.visible = rain.splashes.visible = false;
    camera.position.set(0, 2, -29); camera.updateMatrixWorld();
    lampPool.update(camera); pointPool.update(camera);
    renderer.shadowMap.needsUpdate = true;
    cubeCam.update(renderer, scene);
    rain.streaks.visible = rain.splashes.visible = true;
    scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.environmentIntensity = 0.8;
    W.glassMaterial.uniforms.tEnvCube.value = cubeRT.texture;
    W.glassMaterial.uniforms.uEnvI.value = 0.8;
  }

  // static matrices: bake once
  for (const m of W.meshes) { m.matrixAutoUpdate = false; m.updateMatrix(); }

  const stage = {
    renderer, scene, camera, composer, grade, bloom, hemi, W, nav, props, furn, glows, contact, rain, refl, lampPool, pointPool, ripples, sky, fill, P,
    t: 0, frames: 0, lowQ, reflOn, noReflect: [], rainLevel: 1, indoor: false,
    async compile() {
      onMsg('compiling shaders (first visit only)');
      await new Promise(r => requestAnimationFrame(r));
      try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
    },
    // adaptive resolution: drop the pixel ratio when the frame rate sags, raise it when there is headroom
    adapt: { acc: 0, n: 0, cool: 2, dpr: renderer.getPixelRatio(), max: renderer.getPixelRatio() },
    render(dt, t, rawDt = dt) {
      stage.t = t; tm.t = t;
      if (!params.has('dpr')) {
        const a = stage.adapt; a.acc += rawDt; a.n++; a.cool -= rawDt;
        if (a.acc > 1.5) {
          const fps = a.n / a.acc; a.acc = 0; a.n = 0;
          if (a.cool <= 0 && fps > 8) {
            let d = a.dpr;
            if (fps < 50 && d > 0.5) d = Math.max(0.5, d * 0.85); else if (fps > 70 && d < a.max) d = Math.min(a.max, d / 0.9);
            if (d !== a.dpr) { a.dpr = d; renderer.setPixelRatio(d); resize(); a.cool = 2; }
          }
        }
      }
      sky.material.uniforms.uTime.value = t;
      sky.position.copy(camera.position);
      furn.update(t);
      rain.uniforms.uVel.value.set(1.4, -9.5, 0.7);
      const target = stage.indoor ? 0.0 : stage.rainLevel;
      rain.uniforms.uDensity.value += (target - rain.uniforms.uDensity.value) * Math.min(1, dt * 2);
      wetUniforms.uRain.value = 0.35 + 0.65 * stage.rainLevel;
      if (stage.frames % 3 === 0) rain.setLights(W.lightSources.filter(s => s.strength > 0.05), camera.position);
      rain.update(t, camera, innerHeight * renderer.getPixelRatio());
      if (!stage.indoor || stage.frames % 4 === 0) ripples.update(renderer, t, stage.rainLevel);
      // props beyond the fog are not drawn at all
      if (stage.frames % 8 === 0) { const cp = camera.position; for (const p of props.list) p.mesh.visible = p.pos.distanceToSquared(cp) < 52 * 52; }
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      const shadowFrame = stage.frames % 2 === 0;
      if (shadowFrame) lampPool.update(camera);
      pointPool.update(camera);
      renderer.shadowMap.needsUpdate = shadowFrame;
      if (stage.reflOn && !stage.indoor && (!shadowFrame || stage.frames < 2)) {
        // the reflection only needs the big shapes and the lights: hide props, detail and anything far away
        const cp = camera.position, hidden = stage._hid || (stage._hid = []);
        hidden.length = 0;
        for (const m of W.meshes) { if (!m.visible) continue; const s = m.geometry.boundingSphere; if (!m.userData.reflect || s.center.distanceToSquared(cp) > (55 + s.radius) ** 2) { m.visible = false; hidden.push(m); } }
        for (const p of props.list) if (p.mesh.visible) { p.mesh.visible = false; hidden.push(p.mesh); }
        for (const o of stage.noReflect) if (o.visible) { o.visible = false; hidden.push(o); }
        refl.update(renderer, scene, camera);
        for (const m of hidden) m.visible = true;
      }
      grade.uniforms.uTime.value = t;
      composer.render(dt);
      stage.frames++;
    },
    // how lit is a point (0 dark .. 1+ bright): used for stealth
    lightAt(p) {
      let s = 0.04;
      for (const L of W.lightSources) { const d2 = L.pos.distanceToSquared(p); if (d2 < 400) s += L.strength * 1.5 / (d2 + 2); }
      for (const v of W.pointVirtuals) if (v.indoor) { const d2 = v.pos.distanceToSquared(p); if (d2 < 60) s += v.intensity * 0.04 * flicker(v, tm.t) / (d2 + 1); }
      return s;
    },
    resize,
  };
  stage.noReflect.push(...(furn.small || []));
  return stage;
}
