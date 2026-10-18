// First-person viewmodel: gloved arms + configured weapon on their own scene with their own FOV
// (rendered after the world with a cleared depth buffer, so the gun never clips into walls).
// Procedural sway, bob, inertia, recoil springs, reload / equip / inspect / bolt motions.
// ADS aligns the actual sight (optic sight node on its rail position, or the iron sight line)
// onto the screen centre exactly. Scopes render picture-in-picture with reticle and parallax;
// red dots and holos draw a collimated reticle on the lens.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { safeMerge as mergeGeometries } from '../core/geom.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildWeapon, Armory, assetUrl, patternTexture } from './manifest.js';
import { gltf } from '../core/assets.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ID_Q = new THREE.Quaternion();
const _vtex = new Map();
function variantTex(file, like) {
  if (!_vtex.has(file)) { const t = new THREE.TextureLoader().load(assetUrl(file)); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; _vtex.set(file, t); }
  const t = _vtex.get(file); if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.channel = like.channel; } return t;
}
const spring = (s, target, k, d, dt) => { const a = (target - s.x) * k - s.v * d; s.v += a * dt; s.x += s.v * dt; };
const sp = () => ({ x: 0, v: 0 });

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.15, 'rgba(255,215,140,.95)'); gr.addColorStop(0.45, 'rgba(255,140,40,.35)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + Math.random() * 0.4; g.strokeStyle = 'rgba(255,200,120,.5)'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sideFlashTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.5, 'rgba(255,160,60,.6)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(50, 0, 128, 14); g.lineTo(128, 18); g.quadraticCurveTo(50, 32, 0, 16); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- reticle / scope shaders
function dotLensMaterial(kind) {
  return new THREE.ShaderMaterial({
    uniforms: { uDot: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color(1, 0.08, 0.05) }, uKind: { value: kind === 'holo' ? 1 : 0 }, uVis: { value: 1 } },
    vertexShader: `void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec2 uDot, uRes; uniform vec3 uColor; uniform float uKind, uVis;
      void main(){
        float px = uRes.y / 1440.0;                       // scale reticle with resolution
        float d = length(gl_FragCoord.xy - uDot) / px;
        float a = smoothstep(2.6, 1.4, d);                // 2 MOA dot
        if (uKind > 0.5) a = max(a, smoothstep(1.6, 0.6, abs(d - 26.0)));   // 65 MOA ring
        vec3 glass = vec3(0.04, 0.06, 0.07);
        gl_FragColor = vec4(glass + uColor*a*6.0*uVis, 0.08 + a*uVis);
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });
}
function scopeLensMaterial(rt, reticle) {
  const R = { mil: 0, chevron: 1, lpvo: 2 }[reticle] ?? 0;
  return new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uOff: { value: new THREE.Vector2() }, uAlign: { value: 0 }, uKind: { value: R }, uIllum: { value: new THREE.Color(1, 0.1, 0.05) }, uLens: { value: new THREE.Vector3(0, 0, 0) } },
    // lens coordinates come from the mesh's own x/y (centre + radius measured on load), not its UVs,
    // so any armory lens disc works whatever its unwrap
    vertexShader: `uniform vec3 uLens; varying vec2 vUv; void main(){ vUv = uLens.z > 0.0 ? (position.xy - uLens.xy) / (2.0*uLens.z) + 0.5 : uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D tScene; uniform vec2 uOff; uniform float uAlign, uKind; uniform vec3 uIllum;
      float line(float d, float w){ return smoothstep(w, w*0.4, abs(d)); }
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;                       // -1..1 across the lens
        vec2 q = vec2(-p.x, p.y);                         // lens geometry is mirrored (faces the eye)
        vec3 col = texture2D(tScene, q*0.5 + 0.5).rgb;
        // reticle sits on the focal plane: it moves with the image, parallax shifts it slightly when the eye is off-axis
        vec2 r = q + uOff * 0.06;
        float ret = 0.0;
        if (uKind < 0.5) {            // mil-dot duplex
          float thin = 0.004, thick = 0.02;
          ret += line(r.y, abs(r.x) < 0.5 ? thin : thick) * step(abs(r.x), 1.0);
          ret += line(r.x, abs(r.y) < 0.5 ? thin : thick) * step(abs(r.y), 1.0);
          for (int i = 1; i < 5; i++) { float f = float(i)*0.1; ret += smoothstep(0.013, 0.007, length(r - vec2(f, 0.0))) + smoothstep(0.013, 0.007, length(r + vec2(f, 0.0))) + smoothstep(0.013, 0.007, length(r - vec2(0.0, f))) + smoothstep(0.013, 0.007, length(r + vec2(0.0, f))); }
          ret = clamp(ret, 0.0, 1.0);
          col = mix(col, vec3(0.0), ret);
        } else if (uKind < 1.5) {     // ACOG chevron + bullet drop stadia
          float ch = line(r.y + abs(r.x)*1.2, 0.006) * step(-0.07, r.x) * step(r.x, 0.07) * step(r.y, 0.0) * step(-0.09, r.y);
          float post = line(r.x, 0.005) * step(r.y, -0.09) * step(-0.6, r.y);
          for (int i = 1; i < 6; i++) { float y = -0.12 - float(i)*0.08; post += line(r.y - y, 0.004) * step(abs(r.x), 0.06 - float(i)*0.008); }
          col = mix(col, vec3(0.0), clamp(post, 0.0, 1.0));
          col = mix(col, uIllum*2.5, clamp(ch, 0.0, 1.0));
        } else {                      // LPVO: illuminated dot in a circle + horizontal stadia
          float d = length(r);
          float il = smoothstep(0.022, 0.012, d) + line(d - 0.28, 0.008);
          float st = line(r.y, 0.004) * step(0.3, abs(r.x)) + line(r.x, 0.004) * step(r.y, -0.3);
          col = mix(col, vec3(0.0), clamp(st, 0.0, 1.0));
          col = mix(col, uIllum*2.5, clamp(il, 0.0, 1.0));
        }
        // eyebox: ring of black that eats in when the eye is off the scope axis (scope shadow)
        float edge = length(p + uOff * 1.4);
        float shadowR = mix(0.3, 1.0, uAlign);
        col *= smoothstep(shadowR + 0.02, shadowR - 0.1, edge);
        col *= smoothstep(1.0, 0.9, length(p));
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
  });
}

// ---------------------------------------------------------------- placeholder gloved hands + sleeves
function gloveMaterial(def) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(def?.color || '#1a1b1d'), roughness: 0.78, sheen: 0.6, sheenRoughness: 0.6, sheenColor: 0x555555 });
}
function sleeveMaterial(def) {
  const m = new THREE.MeshPhysicalMaterial({ color: def?.pattern ? 0xffffff : new THREE.Color(def?.color || '#55553f'), map: def?.pattern ? patternTexture(def.color, def.pattern) : null, roughness: 0.9, sheen: 0.8, sheenRoughness: 0.8, sheenColor: 0x777766 });
  return m;
}
const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xc58f6e, roughness: 0.55, sheen: 0.3, sheenColor: 0x995544 });
// A right or left hand wrapped around a cylinder of radius gr (grip) along local +Y (pistol grip) or +Z (handguard).
function buildHand(side, kind, glove) {
  const g = new THREE.Group(); g.name = 'hand_' + side;
  const gm = gloveMaterial(glove), parts = [], pads = [], skin = [];
  const s = side === 'R' ? 1 : -1;
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  const seg = (len, r) => new THREE.CapsuleGeometry(r, len, 4, 8);
  // palm: sits on the outside of the grip
  parts.push(rb(0.03, 0.085, 0.08, 0.012).translate(s * 0.03, -0.01, -0.01));
  pads.push(rb(0.012, 0.06, 0.07, 0.005).translate(s * 0.047, -0.01, -0.01));
  // four fingers wrapping around the grip (3 phalanges each)
  const fingerless = !!glove?.fingerless;
  for (let i = 0; i < 4; i++) {
    const y = 0.025 - i * 0.022, len = [0.026, 0.028, 0.026, 0.02][i];
    let p = new THREE.Vector3(s * 0.03, y, 0.03), ang = 0;
    for (let k = 0; k < 3; k++) {
      const L = len * (k === 0 ? 1 : k === 1 ? 0.75 : 0.6), r = 0.0085 - k * 0.0008;
      const dir = new THREE.Vector3(-s * Math.sin(ang), 0, Math.cos(ang));
      const c = seg(L, r); c.rotateX(Math.PI / 2); c.applyMatrix4(new THREE.Matrix4().makeRotationY(-s * ang));
      c.translate(p.x + dir.x * L / 2, p.y, p.z + dir.z * L / 2);
      ((fingerless && k > 0) ? skin : parts).push(c);
      p.addScaledVector(dir, L); ang += 1.25;
    }
  }
  // thumb along the other side
  const th = seg(0.04, 0.0095); th.rotateX(Math.PI / 2 - 0.4); th.rotateY(s * 0.9); th.translate(-s * 0.005, 0.03, 0.025); parts.push(th);
  // cuff
  parts.push(new THREE.CylinderGeometry(0.034, 0.036, 0.05, 14).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(s * 0.028, -0.01, -0.07));
  const m1 = new THREE.Mesh(mergeGeometries(parts), gm); m1.name = 'glove';
  const m2 = new THREE.Mesh(mergeGeometries(pads), new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.6 }));
  g.add(m1, m2);
  if (skin.length) g.add(new THREE.Mesh(mergeGeometries(skin), skinMat));
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  if (kind === 'support') g.rotation.set(0, 0, s * Math.PI / 2);
  return g;
}
function buildForearm(sleeveDef) {
  const g = new THREE.Group();
  // forearm along +Z from wrist (z=0) to elbow (z=1, scaled)
  const fore = new THREE.CylinderGeometry(0.036, 0.046, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const sleeve = new THREE.CylinderGeometry(0.05, 0.06, 1.2, 18, 3, false).rotateX(Math.PI / 2).translate(0, 0, 0.75);
  // sleeve folds
  const pos = sleeve.attributes.position;
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i), a = Math.atan2(pos.getY(i), pos.getX(i)); const k = 1 + 0.06 * Math.sin(z * 9 + a * 2) * Math.sin(a * 3); pos.setX(i, pos.getX(i) * k); pos.setY(i, pos.getY(i) * k); }
  sleeve.computeVertexNormals();
  const fm = new THREE.Mesh(fore, gloveMaterial({ color: '#222' })), sm = new THREE.Mesh(sleeve, sleeveMaterial(sleeveDef));
  fm.name = 'wrist'; sm.name = 'sleeve';
  g.add(fm, sm);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

export class ViewModel {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x332a22, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 1.2, 2);
    this.fill = new THREE.PointLight(0xffffff, 0, 2, 2);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flashLight, this.fill);
    this.adsRig = new THREE.Group(); this.sway = new THREE.Group(); this.kick = new THREE.Group(); this.hold = new THREE.Group();
    this.scene.add(this.adsRig); this.adsRig.add(this.sway); this.sway.add(this.kick); this.kick.add(this.hold);
    this.weapon = null; this.arms = null;
    this.ads = 0; this.adsTarget = 0;
    this.s = { yaw: sp(), pitch: sp(), px: sp(), py: sp(), kz: sp(), kp: sp(), kr: sp(), ky: sp(), land: sp(), lean: sp(), sprint: sp(), crouch: sp() };
    this.bobPhase = 0; this.bobAmt = 0;
    this.anim = null;   // {type, t, dur}
    this.flashT = 0;
    // muzzle flash sprites
    const ft = flashTexture(), st = sideFlashTexture();
    this.flash = new THREE.Group();
    const fmat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(3, 2.6, 2.2) });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), fmat); front.name = 'front';
    const smat = new THREE.MeshBasicMaterial({ map: st, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(3, 2.5, 2) });
    for (let i = 0; i < 3; i++) { const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.05).translate(0.11, 0, 0).rotateY(-Math.PI / 2), smat); sm.rotation.z = i * Math.PI / 3; this.flash.add(sm); }
    this.flash.add(front);
    this.flash.visible = false;
    this.flash.traverse(o => { o.frustumCulled = false; o.renderOrder = 10; });
    // scope PIP
    this.scopeRT = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType });
    this.scopeCam = new THREE.PerspectiveCamera(5, 1, 0.1, 2000);
    this.useScope = false;
    this.fov = 54;
    this.sightInfo = { S: new THREE.Vector3(), F: new THREE.Vector3(0, 0, -1) };
  }
  setLighting(sunDirWorld, sunColor, sunI, hemiSky, hemiGround, hemiI, env, envI) {
    this.sunDirWorld = sunDirWorld.clone().normalize();
    this.sun.color.set(sunColor); this.sun.intensity = sunI;
    this.hemi.color.set(hemiSky); this.hemi.groundColor.set(hemiGround); this.hemi.intensity = hemiI;
    this.scene.environment = env; this.scene.environmentIntensity = envI;
  }
  async equip(cfg, opts = {}) {
    const w = await buildWeapon(cfg);
    if (this.weapon) { this.hold.remove(this.weapon.root); }
    this.weapon = w;
    this.cls = w.def.class;
    // hip pose (grip point position in camera space) per class
    const hip = { pistol: [0.12, -0.13, -0.4], smg: [0.12, -0.14, -0.36], ar: [0.125, -0.145, -0.37], sniper: [0.13, -0.15, -0.38], shotgun: [0.125, -0.15, -0.37] }[this.cls] || [0.125, -0.145, -0.37];
    this.hipPos = new THREE.Vector3(...hip);
    this.hold.position.copy(this.hipPos);
    this.hold.rotation.set(0, 0, 0);
    // gun model +Z forward -> camera -Z: rotate PI about Y; grip_R at the hold origin
    w.root.rotation.set(0, Math.PI, 0);
    w.root.position.set(0, 0, 0);
    w.root.updateMatrixWorld(true);
    const gr = w.gripR ? w.gripR.position.clone() : new THREE.Vector3();
    w.root.position.set(gr.x, -gr.y, gr.z);   // rotated: (-x, y, -z) -> offset back
    this.hold.add(w.root);
    w.muzzle.add(this.flash);
    this.flash.position.set(0, 0, 0.02); this.flash.rotation.set(0, Math.PI, 0);
    this.flash.children.forEach(c => { if (c.name === 'front') c.rotation.set(0, Math.PI, 0); });
    await this.buildArms(cfg);
    // lens materials
    this.lensMat = null; this.useScope = false;
    const optic = Armory.att(cfg.optic)?.optic;
    this.optic = optic || { zoom: 1, reticle: 'iron', eyeRelief: 0.18 };
    if (this.optic.reticle === 'iron') this.optic = { ...this.optic, eyeRelief: w.def.ads?.eye ?? (w.def.class === 'pistol' ? 0.32 : 0.12) };
    // scope placement: the cheek weld (eye) stays put on the stock, so sliding the optic along the rail
    // changes the real eye-to-optic distance. Rail 0.5 is the optic's ideal eye relief; forward = farther.
    this.adsRelief = this.optic.eyeRelief;
    if (this.optic.reticle !== 'iron' && w.sockets.rail_start && w.sockets.rail_end) {
      const railLen = w.sockets.rail_start.position.distanceTo(w.sockets.rail_end.position);
      this.adsRelief = Math.max(0.045, this.optic.eyeRelief + ((cfg.rail ?? 0.5) - 0.5) * railLen);
    }
    this.reliefErr = this.adsRelief - this.optic.eyeRelief;
    if (w.lens) {
      if (this.optic.zoom >= 2) {
        this.lensMat = scopeLensMaterial(this.scopeRT, this.optic.reticle); this.useScope = true;
        const g = w.lens.geometry; if (g) { g.computeBoundingBox(); const b = g.boundingBox; this.lensMat.uniforms.uLens.value.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2); }
        if (w.opticColor) this.lensMat.uniforms.uIllum.value.set(w.opticColor);
      } else { this.lensMat = dotLensMaterial(this.optic.reticle); if (w.opticColor) this.lensMat.uniforms.uColor.value.set(w.opticColor); }
      w.lens.material = this.lensMat; w.lens.renderOrder = 5;
    }
    this.anim = opts.silent ? null : { type: 'equip', t: 0, dur: 0.55 };
    if (!opts.silent && this.mixer && this.clips?.equip) { const ac = this.mixer.clipAction(this.clips.equip); ac.reset(); ac.setLoop(THREE.LoopOnce); ac.timeScale = this.clips.equip.duration / 0.55; ac.play(); }
    this.updateMatrix();
    return w;
  }
  async buildArms(cfg) {
    if (this.arms) { this.arms.parent?.remove(this.arms); this.arms = null; }
    this.armParts = null; this.mixer = null;
    const A = Armory.m.arms;
    const glove = Armory.m.gloves.find(x => x.id === cfg.glove), sleeve = Armory.m.sleeves.find(x => x.id === cfg.sleeve);
    if (A.file) {
      try {
        const g = await gltf(assetUrl(A.file));
        const arms = SkeletonUtils.clone(g.scene);
        arms.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; const n = (o.material?.name || o.name || '').toLowerCase();
          // armory variants ship their own colour maps; placeholder variants only tint
          if (/glove|hand/.test(n) && glove) { o.material = o.material.clone(); if (glove.texture) { o.material.map = variantTex(glove.texture, o.material.map); o.material.color.set(0xffffff); } else o.material.color.set(glove.color); }
          if (/sleeve|arm|jacket|shirt/.test(n) && sleeve) { o.material = o.material.clone(); if (sleeve.texture) { o.material.map = variantTex(sleeve.texture, o.material.map); o.material.color.set(0xffffff); } else if (sleeve.pattern) { o.material.map = patternTexture(sleeve.color, sleeve.pattern); o.material.color.set(0xffffff); } else o.material.color.set(sleeve.color); } } });
        // the glove cuff and the forearm skin deform with slightly different weights, so the skin poked
        // through the cuff in jagged patches: inflate the glove 2.5 mm along its normals (before skinning)
        arms.traverse(o => { if (o.isMesh && /glove/i.test(o.material?.name || o.name || '')) { if (!o.material.userData.inflated) { o.material = o.material.clone(); o.material.userData.inflated = true; }
          o.material.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.0025;'); };
          o.material.customProgramCacheKey = () => 'glove-inflate'; o.material.needsUpdate = true; } });
        // weapon bone: the gun is parented to it so clips drive the gun
        const boneName = A.weapon_bone || A.gun_bone;
        let bone = boneName ? arms.getObjectByName(boneName) : null;
        if (!bone) arms.traverse(o => { if (!bone && o.isBone && /weapon|gun|prop|ik_hand_gun/i.test(o.name)) bone = o; });
        this.mixer = new THREE.AnimationMixer(arms);
        this.clips = {};
        const gid = cfg.gun, find = n => n && g.animations.find(a => a.name === n || a.name.toLowerCase() === String(n).toLowerCase());
        for (const k of ['idle', 'ads', 'fire', 'fire_ads', 'sprint', 'equip', 'inspect']) { const c = find(gid + '_' + k) || find(A.clips?.[gid + '_' + k]) || find(A.clips?.[k]) || find(k); if (c) this.clips[k] = c; }
        const rc = find('reload_' + gid) || find(A.clips?.['reload_' + gid]) || find(gid + '_reload'); if (rc) this.clips.reload = rc;
        // the armory authors the rig with the eye at the origin looking glTF +Z; the camera looks -Z.
        // The weapon bone's animated pose IS the hip/ADS placement, so the root only turns around.
        arms.rotation.set(0, Math.PI, 0);
        // lift the authored hip pose a little: our weapon camera is 54 deg vertical, the gun sat on the screen edge
        arms.position.fromArray(A.offset || [-0.008, 0.035, 0.01]);
        this.realArms = { root: arms, bone };
        this.kick.add(arms);
        this.idleAction = this.adsAction = this.sprintAction = null;
        if (this.clips.idle) { this.idleAction = this.mixer.clipAction(this.clips.idle); this.idleAction.play(); }
        if (this.clips.ads) { this.adsAction = this.mixer.clipAction(this.clips.ads); this.adsAction.play(); this.adsAction.weight = 0; }
        if (this.clips.sprint) { this.sprintAction = this.mixer.clipAction(this.clips.sprint); this.sprintAction.play(); this.sprintAction.weight = 0; }
        if (bone) {
          // keep the gun's grip on the weapon bone
          this.hold.remove(this.weapon.root); bone.add(this.weapon.root);
          // bone children live in the Blender armature frame (Z up, -Y forward); the gun GLB is glTF
          // (Y up, +Z forward): +90 deg about X converts one to the other
          this.weapon.root.position.set(0, 0, 0); this.weapon.root.rotation.set(A.gun_rot_x ?? Math.PI / 2, A.gun_rot_y ?? 0, 0);
          // the GLB's own root sits at the weapon bone; the holder must not re-offset it by grip_R
          this.weapon.model.position.set(0, 0, 0); this.weapon.model.rotation.set(0, 0, 0);
        }
        this.arms = arms;
        return;
      } catch (e) { console.warn('[viewmodel] arms file failed, using placeholder', e.message); this.realArms = null; }
    }
    this.realArms = null;
    const w = this.weapon;
    const handR = buildHand('R', 'grip', glove), handL = buildHand('L', w.def.class === 'pistol' ? 'cup' : 'support', glove);
    // right hand on the pistol grip (gun local space: grip runs down/back)
    const gR = w.gripR; gR.add(handR); handR.position.set(0, 0, 0); handR.rotation.set(-0.3, 0, 0);
    const gL = w.gripL || w.gripR;
    gL.add(handL);
    if (w.def.class === 'pistol') { handL.position.set(-0.005, -0.012, 0.01); handL.rotation.set(-0.3, 0.2, 0); }
    else { handL.position.set(0, -0.03, 0); handL.rotation.set(0, 0, 0); handL.rotation.z = -Math.PI / 2; handL.rotation.y = 0; }
    if (gL !== w.gripL && w.def.class !== 'pistol') handL.position.set(0, -0.02, 0.2);
    const foreR = buildForearm(sleeve), foreL = buildForearm(sleeve);
    this.sway.add(foreR, foreL);
    this.armParts = { handR, handL, foreR, foreL };
    this.arms = new THREE.Group(); // marker
  }
  // place forearms between the wrist (glove cuff) and an elbow point off-screen
  _updateForearms() {
    const P = this.armParts; if (!P) return;
    const place = (fore, hand, elbowCam, side) => {
      hand.updateWorldMatrix(true, false);
      const wrist = _v.set(side * 0.028, -0.01, -0.09).applyMatrix4(hand.matrixWorld);
      this.sway.worldToLocal(wrist);
      const elbow = _v2.copy(elbowCam);
      const L = wrist.distanceTo(elbow);
      fore.position.copy(wrist);
      fore.lookAt(_v3.copy(elbow).applyMatrix4(this.sway.matrixWorld));
      fore.scale.set(1, 1, L);
      fore.children[0].scale.set(1, 1, 1); // wrist
    };
    const crouch = this.s.crouch.x;
    place(P.foreR, P.handR, _v3.set(0.26, -0.42 - crouch * 0.02, 0.02), 1);
    const leftElbow = this.cls === 'pistol' ? new THREE.Vector3(-0.08, -0.45, 0.05) : new THREE.Vector3(-0.12, -0.36, -0.08);
    place(P.foreL, P.handL, leftElbow, -1);
  }
  fire(stats) {
    // recoil kick: back, muzzle climb, a little random roll / yaw
    const k = Math.min(2.2, 0.6 + stats.recoilV * 0.6) * (1 - 0.45 * this.ads);
    this.s.kz.v += 1.6 * k; this.s.kp.v += 9 * k * (0.7 + Math.random() * 0.6); this.s.kr.v += (Math.random() - 0.5) * 14 * k; this.s.ky.v += (Math.random() - 0.5) * 6 * k;
    this.flashT = stats.flash < 0.1 ? 0 : 0.045;
    if (this.flashT) {
      this.flash.visible = true; this.flash.rotation.z = Math.random() * 6.28;
      const sc = (0.7 + Math.random() * 0.5) * Math.min(1.6, stats.flash);
      this.flash.scale.setScalar(sc);
      this.flash.children.forEach(c => { if (c.name !== 'front') c.visible = stats.flash > 0.5; });
      this.flashLight.intensity = 3 * Math.min(1.5, stats.flash);
    }
    if (this.mixer && this.clips?.fire) { const c = (this.adsW > 0.5 && this.clips.fire_ads) || this.clips.fire; const a = this.mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = false; a.play(); }
    this.playGun(['fire', 'fire_ads', 'shoot'], 1);
    if (stats.cls === 'sniper' || stats.cls === 'shotgun') this.anim = { type: stats.cls === 'sniper' ? 'bolt' : 'pump', t: -0.12, dur: 60 / stats.rpm * 0.85 };
  }
  reload(dur, empty) {
    this.anim = { type: 'reload', t: 0, dur, empty, magDone: false };
    if (this.mixer && this.clips?.reload) { const a = this.mixer.clipAction(this.clips.reload); a.reset(); a.setLoop(THREE.LoopOnce); a.timeScale = this.clips.reload.duration / dur; a.play(); }
    this.playGun(['reload'], null, dur);
  }
  // gun-side clips (bolt, mag, charging handle) shipped in the gun GLB
  playGun(keys, timeScale, dur) {
    const W = this.weapon; if (!W?.mixer) return;
    const id = W.def.id;
    for (const k of keys) {
      const c = W.anims.find(a => a.name === id + '_' + k || a.name === k + '_' + id || a.name === k);
      if (c) { const a = W.mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = false; a.timeScale = dur ? c.duration / dur : (timeScale || 1); a.play(); return; }
    }
  }
  shellReload(dur) { this.anim = { type: 'shell', t: 0, dur }; }
  inspect() { if (!this.anim) this.anim = { type: 'inspect', t: 0, dur: 2.6 }; if (this.mixer && this.clips?.inspect) { const a = this.mixer.clipAction(this.clips.inspect); a.reset(); a.setLoop(THREE.LoopOnce); a.play(); } }
  cancelAnim() { if (this.anim && this.anim.type === 'inspect') this.anim = null; }
  get busy() { return this.anim && (this.anim.type === 'reload' || this.anim.type === 'equip' || this.anim.type === 'shell'); }

  // inp: { dt, lookDX, lookDY, speed, sprint, tac, crouch, slide, lean, grounded, landImpulse, adsTarget, adsTime, cameraFov, mainCamera }
  update(inp) {
    const dt = inp.dt, s = this.s;
    // ADS weight eased over the gun's ads time (no ADS while sprinting or reloading)
    const target = inp.adsTarget && !inp.sprint && !(this.anim && this.anim.type === 'reload') ? 1 : 0;
    const rate = dt / Math.max(0.05, inp.adsTime);
    this.ads = THREE.MathUtils.clamp(this.ads + (target ? rate : -rate * 1.3), 0, 1);
    const w = this.ads * this.ads * (3 - 2 * this.ads);
    this.adsW = w;
    // sway: mouse motion drags the gun behind the view
    const swayK = 1 - 0.85 * w;
    spring(s.yaw, THREE.MathUtils.clamp(-inp.lookDX * 0.0022, -0.12, 0.12) * swayK, 120, 16, dt);
    spring(s.pitch, THREE.MathUtils.clamp(-inp.lookDY * 0.0022, -0.1, 0.1) * swayK, 120, 16, dt);
    spring(s.px, -s.yaw.x * 0.25, 90, 14, dt); spring(s.py, s.pitch.x * 0.2, 90, 14, dt);
    spring(s.kz, 0, 260, 22, dt); spring(s.kp, 0, 240, 20, dt); spring(s.kr, 0, 200, 18, dt); spring(s.ky, 0, 200, 18, dt);
    spring(s.land, 0, 140, 12, dt); if (inp.landImpulse) s.land.v -= inp.landImpulse;
    spring(s.lean, inp.lean, 60, 12, dt);
    spring(s.sprint, inp.sprint ? (inp.tac ? 1.35 : 1) : 0, 70, 13, dt);
    spring(s.crouch, inp.slide ? 1 : 0, 50, 12, dt);
    // bob
    const moving = inp.grounded ? Math.min(1, inp.speed / 4) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 8);
    this.bobPhase += dt * (inp.speed > 0.2 && inp.grounded ? 1.7 + inp.speed * 0.95 : 0) ;
    const bob = this.bobAmt * (1 - 0.8 * w) * (inp.sprint ? 1.8 : 1);
    const bx = Math.sin(this.bobPhase) * 0.009 * bob, by = -Math.abs(Math.cos(this.bobPhase)) * 0.008 * bob;
    const breath = Math.sin(performance.now() * 0.0012) * 0.0012 * (1 - w * 0.6);
    // procedural animations
    let ax = 0, ay = 0, az = 0, rx = 0, ry = 0, rz = 0, magOff = 0;
    const A = this.anim;
    if (A) {
      A.t += dt;
      const clipDriven = this.realArms && this.clips && ((A.type === 'reload' && this.clips.reload) || (A.type === 'equip' && this.clips.equip) || (A.type === 'inspect' && this.clips.inspect) || ((A.type === 'bolt' || A.type === 'pump') && this.clips.fire)); const k = THREE.MathUtils.clamp(A.t / A.dur, 0, 1);
      const ease = x => x * x * (3 - 2 * x), bump = (a, b) => k < a || k > b ? 0 : Math.sin((k - a) / (b - a) * Math.PI);
      if (A.type === 'equip') { const e = 1 - ease(k); ay -= e * 0.25; rx -= e * 0.9; rz += e * 0.4; }
      else if (A.type === 'reload') {
        const tilt = bump(0.0, 1.0);
        rz += tilt * 0.55; rx += tilt * 0.18; ay -= tilt * 0.04; ax -= tilt * 0.03;
        // magazine drops out 0.15-0.4, new one rises 0.45-0.72, slap at 0.72
        if (k > 0.15 && k < 0.45) magOff = -ease((k - 0.15) / 0.3) * 0.35; else if (k >= 0.45 && k < 0.72) magOff = -(1 - ease((k - 0.45) / 0.27)) * 0.25; else magOff = 0;
        if (k > 0.7 && k < 0.8) { ay += Math.sin((k - 0.7) / 0.1 * Math.PI) * 0.012; }
        if (A.empty && k > 0.82) { rx -= bump(0.82, 1) * 0.12; ax += bump(0.82, 1) * 0.02; }
      } else if (A.type === 'shell') { const b = bump(0, 1); rz += b * 0.35; rx += b * 0.1; ay -= b * 0.03; }
      else if (A.type === 'bolt') { if (A.t > 0) { const b = bump(0, 1); rz += b * 0.35; ax -= b * 0.02; ay -= b * 0.02; } }
      else if (A.type === 'pump') { if (A.t > 0) { const b = bump(0, 1); az += b * 0.07; rx += b * 0.06; } }
      else if (A.type === 'inspect') { const b = bump(0, 1); ry += b * 0.9; rz -= b * 0.6; ax -= b * 0.08; ay += b * 0.04; rx += Math.sin(k * Math.PI * 2) * 0.1 * b; }
      if (clipDriven) { ax = ay = az = rx = ry = rz = 0; magOff = 0; }
      if (A.t >= A.dur) this.anim = null;
    }
    if (this.weapon?.mag && !this.realArms) { this.weapon.mag.position.y = (this.weapon._magY ??= this.weapon.mag.position.y) + magOff; this.weapon.mag.visible = magOff > -0.3; }
    // sprint pose: gun lowered and canted inward
    const spr = s.sprint.x * (1 - w);
    const pistol = this.cls === 'pistol';
    ax += spr * (pistol ? 0.0 : -0.06); ay += spr * -0.06; rx += spr * (pistol ? 0.6 : -0.25); ry += spr * (pistol ? 0.0 : 0.85); rz += spr * (pistol ? 0.1 : 0.3);
    // lean & slide roll
    rz += s.lean.x * 0.25 + s.crouch.x * 0.25 * (1 - w);
    // compose hold pose (hip) + sway
    this.sway.position.set(s.px.x * (1 - w) + bx + ax, s.py.x * (1 - w) + by + ay + breath + s.land.x * 0.02, az);
    this.sway.rotation.set(s.pitch.x + rx, s.yaw.x + ry, s.yaw.x * 0.6 + rz, 'YXZ');
    this.kick.position.set(0, 0, 0); this.kick.rotation.set(0, 0, 0);
    this.adsRig.position.set(0, 0, 0); this.adsRig.quaternion.identity();
    if (this.mixer) {
      if (this.adsAction) this.adsAction.weight = w; if (this.idleAction) this.idleAction.weight = 1 - w;
      if (this.sprintAction) { const sw = Math.min(1, s.sprint.x) * (1 - w); this.sprintAction.weight = sw; if (this.idleAction) this.idleAction.weight *= 1 - sw; }
      this.mixer.update(dt);
    }
    if (this.weapon?.mixer) this.weapon.mixer.update(dt);
    this.adsRig.updateMatrixWorld(true);
    // ADS: rotate + translate the rig so the sight line lies on the camera axis
    if (w > 0.0005 && this.weapon) {
      const { S, F } = this.sightLine();
      _q.setFromUnitVectors(F, _v.set(0, 0, -1));
      _q2.copy(ID_Q).slerp(_q, w);
      const relief = this.adsRelief || this.optic.eyeRelief || 0.18;
      // pivot rotation about S, then translate S toward (0,0,-relief)
      const pos = _v2.copy(this.adsRig.position).sub(S).applyQuaternion(_q2).add(S);
      const tgt = _v3.set(0, 0, -relief);
      pos.addScaledVector(tgt.sub(S), w);
      this.adsRig.position.copy(pos); this.adsRig.quaternion.premultiply(_q2);
    }
    // recoil kick on top (pivot near the grip)
    const kw = 1 - 0.55 * w;
    this.kick.position.set(s.ky.x * 0.002 * kw, s.kp.x * 0.0012 * kw, s.kz.x * 0.03 * (1 - 0.3 * w));
    this.kick.rotation.set(s.kp.x * 0.01 * kw, s.ky.x * 0.006 * kw, s.kr.x * 0.006, 'YXZ');
    // muzzle flash
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }
    this.adsRig.updateMatrixWorld(true);
    if (this.flash.visible) this.flash.getWorldPosition(this.flashLight.position);
    this._updateForearms();
    // lights in camera space
    if (this.sunDirWorld && inp.mainCamera) {
      _q.copy(inp.mainCamera.quaternion).invert();
      this.sun.position.copy(this.sunDirWorld).applyQuaternion(_q).multiplyScalar(5); this.sun.target.position.set(0, 0, 0);
    }
    // FOV: weapon camera narrows slightly when aiming so the optic reads bigger
    this.cam.fov = this.fov * (1 - 0.18 * w);
    this.cam.updateProjectionMatrix();
    this.updateMatrix();
    this.updateLens(inp);
  }
  updateMatrix() { this.scene.updateMatrixWorld(true); }
  // sight point S and sight direction F in camera space
  sightLine() {
    const W = this.weapon, S = this.sightInfo.S, F = this.sightInfo.F;
    W.sight.obj.getWorldPosition(S);
    if (W.sight.iron && W.sight.front) { W.sight.front.getWorldPosition(_v); F.subVectors(_v, S).normalize(); }
    else { W.model.getWorldQuaternion(_q); F.set(0, 0, 1).applyQuaternion(_q).normalize(); }
    return this.sightInfo;
  }
  // where a viewmodel point appears on screen, expressed as a world point at the same depth (for flashes, tracers, laser origin)
  toWorld(obj, mainCam, out = new THREE.Vector3()) {
    obj.getWorldPosition(out);
    return this.vmToWorld(out, mainCam, out);
  }
  vmToWorld(p, mainCam, out = new THREE.Vector3()) {
    const d = -p.z;
    _v.copy(p).project(this.cam);             // NDC in the weapon camera
    _v.z = 0.5; _v.unproject(mainCam);         // same screen point in the main camera
    out.copy(_v).sub(mainCam.position).normalize();
    const camFwd = _v2.set(0, 0, -1).applyQuaternion(mainCam.quaternion);
    return out.multiplyScalar(d / Math.max(0.05, out.dot(camFwd))).add(mainCam.position);
  }
  // barrel direction in world space (where the gun points; scope cam and laser use it)
  barrelDir(mainCam, out = new THREE.Vector3()) {
    const { F } = this.sightLine();
    return out.copy(F).applyQuaternion(mainCam.quaternion).normalize();
  }
  updateLens(inp) {
    if (!this.lensMat || !this.weapon?.lens) return;
    const R = inp.res || _v2.set(1, 1);
    if (!this.useScope) {
      // collimated dot: appears where the optic axis points at infinity
      const { S, F } = this.sightLine();
      _v.copy(S).addScaledVector(F, 1000).project(this.cam);
      this.lensMat.uniforms.uDot.value.set((_v.x * 0.5 + 0.5) * R.x, (_v.y * 0.5 + 0.5) * R.y);
      this.lensMat.uniforms.uRes.value.copy(R);
      if (inp.reticleColor) this.lensMat.uniforms.uColor.value.copy(inp.reticleColor);
    } else {
      const { S, F } = this.sightLine();
      // misalignment between eye axis and scope axis -> parallax / scope shadow
      const off = _v.set(S.x, S.y, 0).multiplyScalar(30);
      const ang = Math.acos(THREE.MathUtils.clamp(-F.z, -1, 1));
      this.lensMat.uniforms.uOff.value.set(off.x + F.x * 4, off.y + F.y * 4);
      // outside the scope's eye box (~2.5 cm either way) the image shrinks to a tunnel: scope shadow
      const boxErr = Math.max(0, Math.abs(this.reliefErr || 0) - 0.025);
      this.lensMat.uniforms.uAlign.value = THREE.MathUtils.clamp(this.adsW * 1.2 - ang * 8 - boxErr * 9, 0, 1);
    }
  }
  // render the scope view (call before the main composer)
  renderScope(renderer, scene, mainCam) {
    if (!this.useScope || this.adsW < 0.02) return;
    const c = this.scopeCam;
    c.position.copy(mainCam.position);
    const dir = this.barrelDir(mainCam, _v3);
    c.up.set(0, 1, 0).applyQuaternion(mainCam.quaternion);
    c.lookAt(_v.copy(c.position).add(dir));
    // true magnification: the lens subtends some angle on screen, the image inside is zoom x narrower than that
    const lensAngle = 2 * Math.atan(0.0175 / Math.max(0.06, this.adsRelief || this.optic.eyeRelief || 0.1));
    c.fov = THREE.MathUtils.radToDeg(lensAngle) * (mainCam.fov / this.cam.fov) / this.optic.zoom * 1.4;
    c.near = 0.2; c.far = mainCam.far; c.layers.mask = mainCam.layers.mask;
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    const prev = renderer.getRenderTarget();
    const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;   // shadows are already current
    renderer.setRenderTarget(this.scopeRT); renderer.clear(); renderer.render(scene, c);
    renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = au;
  }
}
