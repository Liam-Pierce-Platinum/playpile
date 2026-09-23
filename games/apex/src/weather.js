// =====================================================================
// APEX :: weather.js - RAIN, STANDING WATER, AND THE ROAD REFLECTING IT
// =====================================================================
//
// Liam: "add in temperatures and water and rain and just weather and
// reflections for water".
//
// Two numbers run the whole thing:
//
//   rain    how hard it is raining now, 0..1. Set by the forecast chosen
//           in the menu - dry, light rain, heavy rain, or changeable,
//           which starts dry, rains, and stops again.
//   water   how much water is ON THE ROAD, 0..1. It lags the rain: a
//           shower takes a minute or two to soak the track, and it takes
//           longer than that to dry once it stops. This is what the tyres
//           feel (car.js reads it as car.water) and what the road shows.
//
// And the air and track temperature follow the cloud, which is what the
// tyre temperatures cool towards.
//
// WHAT YOU SEE
//   - rain streaks round the camera, slanting with your speed
//   - the sky, sun, fog and light going grey and closing in
//   - the road darkening and going glossy as it wets, and PUDDLES growing
//     in the dips as the water rises, which are mirrors
//
// THE REFLECTIONS are a real second render, not a cube map: a camera
// mirrored under the road plane renders the scene at half resolution, and
// the road's own material looks the mirrored image up at the screen
// position it is drawn at - the classic planar mirror, with the clip plane
// bent so nothing under the road leaks in. Puddles show it sharp and
// strong, rippling while it rains; the wet road between them shows a
// soft, blurred, fresnel-weighted sheen. Only the materials track.js named
// 'wet' (asphalt, kerbs, lines, pit lane) get it. None of it runs on a dry
// road, so a dry race costs nothing.
import * as THREE from '../vendor/three.module.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const FORECASTS = {
  dry:      { name: 'DRY' },
  changing: { name: 'CHANGEABLE' },
  light:    { name: 'LIGHT RAIN' },
  heavy:    { name: 'HEAVY RAIN' },
};

export class Weather {
  constructor({ scene, renderer, camera, sun, hemi, env }) {
    Object.assign(this, { scene, renderer, camera, sun, hemi, env });
    this.envCloud = -1;              // the cloud the probe was last built for
    this.kind = 'dry';
    this.rain = 0; this.water = 0; this.cloud = 0; this.t = 0;
    this.air = 24; this.track = 36;
    this.base = {
      sun: sun.intensity, hemi: hemi.intensity, exposure: renderer.toneMappingExposure,
      fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far, bg: scene.background.clone(),
    };
    this.grey = { fog: new THREE.Color(0x7f878f), bg: new THREE.Color(0x747c85), top: new THREE.Color(0x59626c), bot: new THREE.Color(0x8c939a) };

    // ---- the shared uniforms every wet material reads ----------------------
    this.rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.U = {
      uWater: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 },
      tReflect: { value: this.rt.texture }, uReflMat: { value: new THREE.Matrix4() },
      tPuddle: { value: puddleTexture() }, uReflOn: { value: 0 },
    };
    this.mirror = new THREE.PerspectiveCamera();
    this.hide = [];
    this.makeRain();
  }

  /** a new session: which forecast, on which circuit */
  setup(kind, track) {
    this.kind = FORECASTS[kind] ? kind : 'dry';
    this.t = 0;
    // changeable: a dry spell of two to four minutes, rain for three, then it clears
    this.plan = { dryFor: 110 + Math.random() * 120, rainFor: 170 + Math.random() * 80, peak: 0.55 + Math.random() * 0.3 };
    this.rain = this.target(0);
    this.water = kind === 'heavy' ? 0.78 : kind === 'light' ? 0.34 : 0;
    this.cloud = this.kind === 'dry' ? 0 : this.kind === 'changing' ? 0.35 : this.rain;
    this.sky = track.sky;
    this.skyBase = this.sky ? { top: this.sky.material.uniforms.cTop.value.clone(), mid: this.sky.material.uniforms.cMid.value.clone(), bot: this.sky.material.uniforms.cBot.value.clone() } : null;

    // teach the track's road materials to be wet
    this.hide = [];
    track.group.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      const m = o.material;
      if (m && m.name === 'wet') { this.hide.push(o); if (!m.userData.wet) wetten(m, this.U); }
      // the grass is twenty thousand instances and nobody looks for it in a puddle
      else if (o.isInstancedMesh && o.count > 1500) this.hide.push(o);
    });
    this.apply();
  }

  /** how hard it should be raining at session time t */
  target(t) {
    if (this.kind === 'dry') return 0;
    if (this.kind === 'light') return 0.35;
    if (this.kind === 'heavy') return 0.92;
    const p = this.plan;
    if (t < p.dryFor) return 0;
    if (t < p.dryFor + p.rainFor) return p.peak * clamp((t - p.dryFor) / 45, 0, 1) * clamp((p.dryFor + p.rainFor - t) / 40, 0, 1);
    return 0;
  }

  /** the words for the HUD */
  get label() {
    if (this.rain > 0.6) return 'HEAVY RAIN';
    if (this.rain > 0.05) return 'RAIN';
    if (this.water > 0.25) return 'WET';
    if (this.water > 0.05) return 'DRYING';
    return this.cloud > 0.2 ? 'OVERCAST' : 'DRY';
  }

  step(dt) {
    this.t += dt;
    const want = this.target(this.t);
    this.rain += (want - this.rain) * Math.min(1, dt * 0.25);
    // the road soaks towards the rain and dries far more slowly
    if (this.rain > 0.03) this.water += (this.rain * 0.88 - this.water) * Math.min(1, dt * 0.012) + this.rain * dt * 0.002;
    else this.water -= dt * 0.0022 * (1 - this.cloud * 0.6);
    this.water = clamp(this.water, 0, 1);
    const wantCloud = this.kind === 'dry' ? 0 : Math.max(this.rain * 1.1, this.kind === 'changing' ? 0.3 : 0);
    this.cloud += (clamp(wantCloud, 0, 1) - this.cloud) * Math.min(1, dt * 0.08);
    this.air = lerp(25, 15, this.cloud);
    this.track = lerp(40, 17, Math.max(this.cloud, this.water));
    this.U.uTime.value += dt;
    this.apply();
  }

  /** light, fog and sky for the current cloud */
  apply() {
    const c = this.cloud, B = this.base, s = this.scene;
    this.sun.intensity = B.sun * (1 - 0.72 * c);
    this.hemi.intensity = B.hemi * (1 - 0.25 * c);
    this.renderer.toneMappingExposure = B.exposure * (1 - 0.12 * c);
    s.fog.color.copy(B.fog).lerp(this.grey.fog, c);
    s.background.copy(B.bg).lerp(this.grey.bg, c);
    s.fog.near = lerp(B.near, 160, this.rain);
    s.fog.far = lerp(B.far, 1500, this.rain);
    if (this.sky && this.skyBase) {
      const u = this.sky.material.uniforms;
      u.cTop.value.copy(this.skyBase.top).lerp(this.grey.top, c);
      // the horizon IS the fog colour, or the land ends on a hard line
      u.cMid.value.copy(s.fog.color);
      u.cBot.value.copy(this.skyBase.bot).lerp(this.grey.bot, c);
      const clouds = this.sky.children[0];
      if (clouds) { clouds.material.color.setRGB(lerp(0.93, 0.45, c), lerp(0.96, 0.48, c), lerp(0.98, 0.52, c)); clouds.material.opacity = lerp(0.82, 1, c); }
    }
    // THE PROBE. What the cars reflect has to go grey with the sky, or an
    // overcast race has sunny cars in it. Rebuilding it is a cube render
    // and six blur passes, so it happens when the weather has actually
    // moved - about once every few seconds in a changeable race, never in
    // a dry one.
    if (this.env && Math.abs(c - this.envCloud) > 0.06) {
      this.envCloud = c;
      this.scene.environment = this.env.update({
        top: s.fog.color.clone().lerp(new THREE.Color(0x2f5c9e), 0.55),
        mid: s.fog.color,
        ground: new THREE.Color(0x5d6455).lerp(new THREE.Color(0x3c4048), c),
        dir: this.sun.position,
        strength: (1 - c) * (1 - c),
      });
      this.scene.environmentIntensity = lerp(0.62, 0.34, c);
    }
    this.U.uWater.value = this.water;
    this.U.uRain.value = this.rain;
    this.rainLines.visible = this.rain > 0.02;
  }

  // ---------------------------------------------------------------------
  // RAIN STREAKS
  // ---------------------------------------------------------------------
  makeRain() {
    const N = 9000;
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * 70;
      this.drops[i * 3 + 1] = Math.random() * 34;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.N = N;
    this.lastCam = new THREE.Vector3();
    this.scene.add(this.rainLines);
  }

  /** move the rain with the camera; `vel` is the car's velocity, so it slants at you */
  stepRain(dt, vel) {
    if (!this.rainLines.visible) return;
    const cam = this.camera.position, d = this.drops, pos = this.rainLines.geometry.attributes.position.array;
    const n = Math.floor(this.N * clamp(this.rain * 1.1, 0.1, 1));
    const fall = 16, BOX = 35, H = 34;
    // the streak is how far the drop moves RELATIVE TO YOU in a short exposure
    const ex = 0.045;
    const rx = -vel.x * ex, ry = -fall * ex, rz = -vel.z * ex;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      d[i3 + 1] -= fall * dt;
      if (d[i3 + 1] < -2) d[i3 + 1] += H;
      // wrap round the camera, so the box of rain travels with it
      let x = d[i3] - (cam.x % (BOX * 2)), z = d[i3 + 2] - (cam.z % (BOX * 2));
      x = ((x + BOX) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX;
      z = ((z + BOX) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX;
      const X = cam.x + x, Y = cam.y - 6 + d[i3 + 1], Z = cam.z + z;
      pos[i * 6] = X; pos[i * 6 + 1] = Y; pos[i * 6 + 2] = Z;
      pos[i * 6 + 3] = X - rx; pos[i * 6 + 4] = Y - ry; pos[i * 6 + 5] = Z - rz;
    }
    this.rainLines.geometry.setDrawRange(0, n * 2);
    this.rainLines.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------
  // THE MIRROR
  // ---------------------------------------------------------------------
  /** render the reflection for this frame, if the road is wet enough to show one */
  reflect(planeY) {
    const on = this.water > 0.02;
    this.U.uReflOn.value = on ? 1 : 0;
    if (!on) return;
    const r = this.renderer, cam = this.camera;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * 0.5)), h = Math.max(64, Math.round(size.y * 0.5));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    const normal = new THREE.Vector3(0, 1, 0);
    const onPlane = new THREE.Vector3(cam.position.x, planeY, cam.position.z);
    const camPos = cam.position.clone();
    if (camPos.y <= planeY + 0.02) return;
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const V = this.mirror;
    const view = onPlane.clone().sub(camPos).reflect(normal).negate().add(onPlane);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = onPlane.clone().sub(look).reflect(normal).negate().add(onPlane);
    V.position.copy(view);
    V.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    V.lookAt(target);
    V.near = cam.near; V.far = Math.min(cam.far, 2500);
    V.updateMatrixWorld();
    V.projectionMatrix.copy(cam.projectionMatrix);
    V.projectionMatrixInverse.copy(cam.projectionMatrixInverse);

    // world position -> the mirror image's texture coordinates
    this.U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(V.projectionMatrix).multiply(V.matrixWorldInverse);

    // THE OBLIQUE CLIP: bend the near plane onto the road plane, so the
    // ground and anything under it cannot appear in the reflection
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, onPlane).applyMatrix4(V.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = V.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;

    for (const o of this.hide) o.visible = false;
    const shadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const prev = r.getRenderTarget();
    const sky = this.sky && this.sky.position.clone();
    if (this.sky) this.sky.position.copy(V.position);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, V);
    r.setRenderTarget(prev);
    if (this.sky) this.sky.position.copy(sky);
    r.shadowMap.autoUpdate = shadowAuto;
    for (const o of this.hide) o.visible = true;
  }
}

/**
 * Patch a MeshStandardMaterial so it darkens, glosses, puddles and reflects
 * with the shared weather uniforms. Done once per material.
 */
function wetten(m, U) {
  m.userData.wet = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = [
      'varying vec3 vWPos;',
      'uniform float uWater, uRain, uTime, uReflOn;',
      'uniform sampler2D tReflect, tPuddle;',
      'uniform mat4 uReflMat;',
      'float wetAmt, puddle;',
    ].join('\n') + '\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // the puddle field: two scales of noise, and the water level rising through it
    float pn = texture2D(tPuddle, vWPos.xz * 0.031).r * 0.62 + texture2D(tPuddle, vWPos.xz * 0.17).r * 0.38;
    float level = 1.0 - uWater * 0.46;
    puddle = smoothstep(level, level + 0.06, pn) * step(0.12, uWater);
    wetAmt = clamp(uWater * 3.0, 0.0, 1.0);
    diffuseColor.rgb *= mix(1.0, 0.58, wetAmt);
    diffuseColor.rgb *= mix(1.0, 0.55, puddle);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.32, wetAmt);
  roughnessFactor = mix(roughnessFactor, 0.04, puddle);`)
      .replace('#include <tonemapping_fragment>', `
  if (uReflOn > 0.5) {
    vec4 rc = uReflMat * vec4(vWPos, 1.0);
    vec2 ruv = rc.xy / rc.w;
    // rain rings on the water: the look-up wobbles
    vec2 rip = (texture2D(tPuddle, vWPos.xz * 0.8 + vec2(uTime * 0.37, uTime * 0.29)).rg
              - texture2D(tPuddle, vWPos.xz * 0.6 - vec2(uTime * 0.23, uTime * 0.41)).gr);
    ruv += rip * (0.004 + 0.012 * uRain) * (0.3 + puddle);
    vec3 V = normalize(cameraPosition - vWPos);
    float fres = 0.08 + 0.92 * pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    // sharp in a puddle, a blurred sheen on the wet road (a high mip)
    vec3 sharp = texture2D(tReflect, ruv).rgb;
    vec3 soft = texture2D(tReflect, ruv, 3.5).rgb;
    float amt = wetAmt * 0.3 * fres + puddle * (0.4 + 0.45 * fres);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(soft, sharp, puddle), clamp(amt, 0.0, 0.92));
  }
  #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey = () => 'apex-wet';
  m.needsUpdate = true;
}

/** a tiling value-noise texture: puddles, and the ripples on them */
function puddleTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  const layer = (cells, seed) => {
    const grid = [];
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < cells * cells; i++) grid.push(rnd());
    return (x, y) => {
      const fx = x * cells / S, fy = y * cells / S, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (a, b) => grid[((b % cells) + cells) % cells * cells + ((a % cells) + cells) % cells];
      return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
    };
  };
  const a = [layer(4, 11), layer(8, 23), layer(16, 37), layer(32, 51)];
  const b = [layer(8, 71), layer(16, 83), layer(32, 97)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = a[0](x, y) * 0.45 + a[1](x, y) * 0.3 + a[2](x, y) * 0.17 + a[3](x, y) * 0.08;
      const gg = b[0](x, y) * 0.5 + b[1](x, y) * 0.3 + b[2](x, y) * 0.2;
      const o = (y * S + x) * 4;
      img.data[o] = r * 255; img.data[o + 1] = gg * 255; img.data[o + 2] = 0; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
