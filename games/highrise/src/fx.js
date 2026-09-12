// =====================================================================
// HIGHRISE :: fx.js - MUZZLE FLASH, IMPACTS, BRASS, SMOKE
// =====================================================================
//
// Liam: *"add good looking muzzel flash"*.
//
// There was none at all before - the only thing a shot produced was a
// tracer line. That is the single biggest reason firing felt like
// nothing: a gun going off is a light event, and without it the room
// does not react to you shooting in it.
//
// A flash that reads is four things happening in about sixty
// milliseconds, and all four matter:
//
//   1. THE STAR - a bright cross-shaped quad facing the camera. Short,
//      random rotation each shot, additive.
//   2. THE CONE - a second quad ALONG the barrel, so the flash has a
//      direction. Without it a flash is a sticker on the screen.
//   3. THE LIGHT - the room briefly lit from the muzzle. This is the one
//      people cannot name but always notice, because it is what puts the
//      shot in the space rather than on the glass.
//   4. THE BRASS - a casing ejected with physics that lands and stays.
//      Shell casings on the floor are the record of a fight.
//
// Everything here is POOLED. A hundred men on a floor firing bursts
// makes thousands of these a minute, and allocating a mesh per shot is
// the fastest way to turn a firefight into a slideshow.
import * as THREE from '../vendor/three.module.js';

// ---------------------------------------------------------------------
// the sprites, drawn once
// ---------------------------------------------------------------------
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function tex() {
  if (TEX.flash) return TEX;
  // A FLASH IS NOT A DISC. It is a ragged star with a hot white core and
  // a yellow-orange fringe - the shape does most of the work, which is
  // why this is drawn rather than being a radial gradient.
  TEX.flash = canvasTex(128, (x, S) => {
    const c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, S * 0.30);
    g.addColorStop(0, 'rgba(255,255,245,1)');
    g.addColorStop(0.35, 'rgba(255,228,150,0.95)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, S * 0.30, 0, 7); x.fill();
    // the points of the star
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const len = S * (0.22 + (i % 3) * 0.11);
      const w = S * 0.030;
      x.save(); x.translate(c, c); x.rotate(a);
      const gg = x.createLinearGradient(0, 0, len, 0);
      gg.addColorStop(0, 'rgba(255,240,190,0.95)');
      gg.addColorStop(1, 'rgba(255,140,30,0)');
      x.fillStyle = gg;
      x.beginPath(); x.moveTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill();
      x.restore();
    }
  });
  TEX.smoke = canvasTex(64, (x, S) => {
    const c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(190,190,196,0.55)');
    g.addColorStop(0.6, 'rgba(150,150,158,0.20)');
    g.addColorStop(1, 'rgba(120,120,128,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  });
  TEX.hole = canvasTex(64, (x, S) => {
    const c = S / 2;
    x.clearRect(0, 0, S, S);
    // a rim of blown-out material, then the hole
    const g = x.createRadialGradient(c, c, S * 0.10, c, c, S * 0.42);
    g.addColorStop(0, 'rgba(20,18,16,0.95)');
    g.addColorStop(0.55, 'rgba(60,55,50,0.55)');
    g.addColorStop(1, 'rgba(90,85,78,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, S * 0.42, 0, 7); x.fill();
    x.fillStyle = 'rgba(10,9,8,0.98)';
    x.beginPath(); x.arc(c, c, S * 0.13, 0, 7); x.fill();
    // radial cracks, which is what makes it drywall and not a sticker
    x.strokeStyle = 'rgba(30,28,25,0.5)'; x.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 7, l = S * (0.16 + Math.random() * 0.2);
      x.beginPath(); x.moveTo(c, c);
      x.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); x.stroke();
    }
  });
  TEX.spark = canvasTex(32, (x, S) => {
    const c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  });
  return TEX;
}

// ---------------------------------------------------------------------
// a fixed-size pool of camera-facing quads
// ---------------------------------------------------------------------
class Sprites {
  constructor(scene, map, n, opts = {}) {
    this.n = n; this.i = 0;
    this.items = [];
    const mat = new THREE.SpriteMaterial({
      map, transparent: true, depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      color: opts.color === undefined ? 0xffffff : opts.color,
    });
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false; s.frustumCulled = false;
      this.group.add(s);
      this.items.push({ s, life: 0, dur: 1, v: new THREE.Vector3(), size: 1,
                        grow: 0, spin: 0, gravity: 0 });
    }
  }
  spawn(pos, o) {
    const it = this.items[this.i = (this.i + 1) % this.n];
    it.s.position.copy(pos);
    it.s.visible = true;
    it.life = it.dur = o.dur || 0.3;
    it.size = o.size || 0.2;
    it.grow = o.grow || 0;
    it.gravity = o.gravity || 0;
    it.fade = o.fade === undefined ? 1 : o.fade;
    it.v.copy(o.vel || ZERO);
    it.s.material.rotation = Math.random() * 6.283;
    it.s.material.opacity = o.opacity === undefined ? 1 : o.opacity;
    if (o.color !== undefined) it.s.material.color.setHex(o.color);
    it.s.scale.setScalar(it.size);
    return it;
  }
  /** wipe every live sprite - a new run starts in a clean room */
  clear() {
    for (const it of this.items) { it.life = 0; it.s.visible = false; }
    this.i = 0;
  }
  step(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.v.y -= it.gravity * dt;
      it.s.position.addScaledVector(it.v, dt);
      const k = it.life / it.dur;
      it.s.scale.setScalar(it.size * (1 + it.grow * (1 - k)));
      it.s.material.opacity = Math.pow(k, it.fade);
    }
  }
}
const ZERO = new THREE.Vector3();

// ---------------------------------------------------------------------
// decals: bullet holes, stuck to whatever they hit
// ---------------------------------------------------------------------
class Decals {
  constructor(scene, map, n, opts = {}) {
    this.n = n; this.i = 0; this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      color: opts.color === undefined ? 0xffffff : opts.color,
    });
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.frustumCulled = false;
      this.group.add(m); this.items.push(m);
    }
  }
  /** take every mark off the walls */
  clear() {
    for (const m of this.items) m.visible = false;
    this.i = 0;
  }

  /** put one on a surface with the given outward normal */
  place(p, normal, size, rot) {
    const m = this.items[this.i = (this.i + 1) % this.n];
    m.visible = true;
    // OFF THE SURFACE BY A MILLIMETRE. Coplanar with the wall it z-fights,
    // and a flickering bullet hole is worse than no bullet hole.
    // 3 CM, NOT 6 MM. See the near-plane note in main.js: at the depth
    // precision a 700 m far plane leaves, 6 mm is inside the noise and
    // the decal loses the depth test against the wall it is painted on.
    // Three centimetres is still invisible as an offset and is comfortably
    // outside it.
    m.position.copy(p).addScaledVector(normal, 0.03);
    m.lookAt(m.position.clone().add(normal));
    m.rotateZ(rot === undefined ? Math.random() * 6.283 : rot);
    m.scale.set(size, size, 1);
    return m;
  }
}

// ---------------------------------------------------------------------
export class FX {
  constructor(scene) {
    const T = tex();
    this.scene = scene;
    this.flash = new Sprites(scene, T.flash, 24);
    this.smoke = new Sprites(scene, T.smoke, 90, { additive: false });
    this.spark = new Sprites(scene, T.spark, 120);
    this.holes = new Decals(scene, T.hole, 140, { opacity: 0.95 });

    // ONE light, moved and re-lit, never added or removed.
    //
    // three.js recompiles every material in the scene when the number of
    // lights changes, so a PointLight per shot is a stall per shot. A
    // single pooled light that gets teleported to each muzzle is
    // indistinguishable at these durations and costs nothing.
    this.light = new THREE.PointLight(0xffd9a0, 0, 11, 2);
    this.light.visible = false;
    scene.add(this.light);
    this.lightT = 0;

    // ---- brass ------------------------------------------------------
    //
    // Casings are real objects with real physics because they are the
    // only thing in the room that records HOW MUCH shooting happened,
    // and a corridor you have fought down should look like it.
    const bg = new THREE.BoxGeometry(0.008, 0.008, 0.022);
    const bm = new THREE.MeshLambertMaterial({ color: 0xc9a441 });
    this.brass = [];
    this.brassGroup = new THREE.Group();
    scene.add(this.brassGroup);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(bg, bm);
      m.visible = false; m.frustumCulled = false;
      this.brassGroup.add(m);
      this.brass.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, rest: false });
    }
    this.brassI = 0;

    // ---- BURNING FLARES -------------------------------------------
    //
    // Liam wanted a flare gun and, separately, *"cool lighting"*. They are
    // the same feature: in a building lit this flat, a flare is the only
    // moving light source in the game, and a corridor with one burning at
    // the far end of it looks completely unlike the same corridor without.
    //
    // Two of them, pooled, because three point lights is where three.js
    // starts recompiling materials and a third flare is not worth a stall.
    this.flares = [];
    for (let i = 0; i < 2; i++) {
      const L = new THREE.PointLight(0xff5a20, 0, 16, 2);
      L.visible = false;
      scene.add(L);
      this.flares.push({ L, t: 0, x: 0, y: 0, z: 0 });
    }
    this.flareI = 0;
  }

  /** a flare, burning where it landed */
  litFlare(p) {
    const f = this.flares[this.flareI = (this.flareI + 1) % this.flares.length];
    f.t = 15; f.x = p.x; f.y = p.y + 0.06; f.z = p.z;
    f.L.position.set(f.x, f.y + 0.25, f.z);
    f.L.visible = true;
  }

  /**
   * A shot leaves the muzzle. `dir` is where the barrel points, `right`
   * is the shooter's right, which is where the brass goes.
   */
  muzzle(pos, dir, right, scale = 1) {
    const s = 0.30 * scale;
    // the star, at the muzzle
    this.flash.spawn(pos, { dur: 0.045 + 0.02 * scale, size: s * (0.9 + Math.random() * 0.5),
                            grow: 0.5, fade: 0.5 });
    // and a smaller one a little down the barrel, which is what gives the
    // flash a length instead of a position
    const fwd = pos.clone().addScaledVector(dir, 0.10 * scale);
    this.flash.spawn(fwd, { dur: 0.038, size: s * 0.55, grow: 0.8, fade: 0.5 });

    this.light.position.copy(pos).addScaledVector(dir, 0.2);
    this.light.intensity = 26 * scale;
    this.light.visible = true;
    this.lightT = 0.055;

    // a little smoke, drifting, so the air in a corridor gets dirty
    if (Math.random() < 0.7) {
      const v = dir.clone().multiplyScalar(0.6 + Math.random()).setY(0.25 + Math.random() * 0.3);
      this.smoke.spawn(pos.clone().addScaledVector(dir, 0.12), {
        dur: 0.55 + Math.random() * 0.5, size: 0.10 * scale, grow: 3.2, vel: v,
        opacity: 0.30, fade: 1.4 });
    }
    if (right) this.eject(pos, right, dir);
  }

  eject(pos, right, dir) {
    const b = this.brass[this.brassI = (this.brassI + 1) % this.brass.length];
    b.m.visible = true; b.rest = false; b.life = 9;
    b.m.position.copy(pos).addScaledVector(right, 0.05).addScaledVector(dir, -0.12);
    b.m.position.y -= 0.03;
    b.v.copy(right).multiplyScalar(1.6 + Math.random() * 1.4);
    b.v.y += 1.6 + Math.random() * 1.0;
    b.v.addScaledVector(dir, 0.3 * Math.random());
    b.spin.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 34, (Math.random() - 0.5) * 34);
  }

  /** a bullet stopping in a wall */
  impact(p, normal, kind = 'wall') {
    if (kind === 'wall') {
      this.holes.place(p, normal, 0.09 + Math.random() * 0.07);
      for (let i = 0; i < 4; i++) {
        const v = normal.clone().multiplyScalar(1.2 + Math.random() * 2.2);
        v.x += (Math.random() - 0.5) * 2.4; v.y += Math.random() * 2.0; v.z += (Math.random() - 0.5) * 2.4;
        this.spark.spawn(p, { dur: 0.16 + Math.random() * 0.14, size: 0.035, vel: v, gravity: 9 });
      }
      this.smoke.spawn(p, { dur: 0.5, size: 0.06, grow: 3.0, opacity: 0.35,
                            vel: normal.clone().multiplyScalar(0.5).setY(0.4) });
    } else if (kind === 'metal') {
      for (let i = 0; i < 9; i++) {
        const v = normal.clone().multiplyScalar(2 + Math.random() * 5);
        v.x += (Math.random() - 0.5) * 4; v.y += Math.random() * 3; v.z += (Math.random() - 0.5) * 4;
        this.spark.spawn(p, { dur: 0.22, size: 0.028, vel: v, gravity: 14 });
      }
    }
  }

  /**
   * Wipe everything this file has put in the room.
   *
   * Liam: *"bullet casings are not removed"* on a restart. They were not:
   * `Combat.reset()` cleared the blood and the dismemberment and nothing
   * else, so a new run began standing in the brass, smoke and bullet
   * holes of the last one. Casings in particular are the most obvious of
   * the lot, because they are solid objects lying on the carpet rather
   * than fading sprites.
   */
  clear() {
    this.flash.clear();
    this.smoke.clear();
    this.spark.clear();
    this.holes.clear();
    for (const b of this.brass) { b.life = 0; b.rest = false; b.m.visible = false; }
    this.light.visible = false;
    this.light.intensity = 0;
    this.lightT = 0;
  }

  step(dt, solidsAtY) {
    for (const f of this.flares) {
      if (f.t <= 0) continue;
      f.t -= dt;
      if (f.t <= 0) { f.L.visible = false; f.L.intensity = 0; continue; }
      // A FLARE GUTTERS. A steady light reads as a lamp somebody left on;
      // the flicker is the whole reason it feels like something burning.
      const fade = Math.min(1, f.t / 2.5);
      f.L.intensity = (13 + Math.sin(f.t * 31) * 3 + Math.random() * 3) * fade;
      if (Math.random() < 0.55) {
        this.spark.spawn(new THREE.Vector3(f.x, f.y, f.z), {
          dur: 0.35, size: 0.045, gravity: 5,
          vel: new THREE.Vector3((Math.random()-0.5)*1.6, 1.4 + Math.random()*1.6, (Math.random()-0.5)*1.6) });
      }
      if (Math.random() < 0.35) {
        this.smoke.spawn(new THREE.Vector3(f.x, f.y + 0.1, f.z), {
          dur: 1.4, size: 0.10, grow: 4.5, opacity: 0.28, fade: 1.5,
          vel: new THREE.Vector3((Math.random()-0.5)*0.3, 0.8, (Math.random()-0.5)*0.3) });
      }
    }
    this.flash.step(dt); this.smoke.step(dt); this.spark.step(dt);
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.pow(0.0008, dt);
      if (this.lightT <= 0) { this.light.visible = false; this.light.intensity = 0; }
    }
    for (const b of this.brass) {
      if (b.life <= 0 || b.rest) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      b.v.y -= 20 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      if (b.m.position.y <= 0.006) {
        b.m.position.y = 0.006;
        // A CASING BOUNCES ONCE AND THEN LIES STILL. Letting them bounce
        // forever costs frames and looks like popcorn; one bounce is what
        // the ear expects anyway.
        if (b.v.y < -1.2) { b.v.y *= -0.34; b.v.multiplyScalar(0.55); b.spin.multiplyScalar(0.5); }
        else { b.rest = true; b.m.rotation.x = Math.PI / 2; }
      }
    }
  }
}
