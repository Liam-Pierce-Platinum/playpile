// =====================================================================
// PLAYPILE :: games/_deck/deck3d.js - THE 2D GAME, BUILT OUT OF SOLIDS
// =====================================================================
//
// Liam: *"side view 3D for stack"*, *"that 2d 3D thing that you do"*.
//
// What that is, precisely: the game is still played on a flat plane and
// still reads as a 2D game - you see it from the side, nothing moves
// towards or away from you - but everything in it is a real solid with a
// real light on it, so it has a lit face, a shaded face, and a shadow on
// the ground. That is the whole trick. A cube lit from the front-left
// tells you where it is in a way a coloured rectangle cannot, and it
// costs nothing to play because the CAMERA never leaves the side.
//
// Three decisions that make it look deliberate rather than "3D because
// we could":
//
//   AN ORTHOGRAPHIC CAMERA, or a near-orthographic one. Perspective on a
//   side-on game makes the left of the pitch lean one way and the right
//   lean the other, and a ball at the top of the screen appears to be a
//   different size from the same ball at the bottom. Flat is correct.
//
//   ONE KEY LIGHT WITH A SHADOW, warm, from high front-left, plus a cold
//   fill from the other side so the dark faces are not black. Everything
//   here is lambert or toon - nothing is shiny, because a specular
//   highlight on a flat-lit side view reads as a rendering error.
//
//   A LOW BACKING STORE, then scaled up. The ten games run at fixed
//   virtual sizes and this keeps that: the renderer draws at the game's
//   own resolution and the browser scales the canvas, which is why the
//   edges stay crisp instead of turning into a soft modern smear.
import * as THREE from './three.module.js';

export { THREE };

export class Deck3D {
  /**
   * @param {object} o
   * @param {number} o.w,o.h     the game's virtual size, in pixels
   * @param {number} o.units     how many WORLD units fit across the width
   * @param {string} o.bg        clear colour
   * @param {number} [o.tilt]    radians to lean the camera down by, for
   *                             the faint top-face look. 0 is dead side-on.
   * @param {number} [o.scale]   render scale (1 = one device pixel per
   *                             game pixel; 2 is smoother, 0.5 chunkier)
   */
  constructor(o) {
    this.keyName = o.key;          // where the high score lives
    this.W = o.w; this.H = o.h;
    this.units = o.units || 20;
    const scale = o.scale || 1.5;

    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'display:block;touch-action:none';
    (document.getElementById('app') || document.body).appendChild(this.cv);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.cv, antialias: scale <= 1, alpha: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.W * scale, this.H * scale, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(new THREE.Color(o.bg || '#0a0e14'), 1);

    this.scene = new THREE.Scene();

    // ---- the camera --------------------------------------------------
    //
    // TWO KINDS. The side-view games (STACK, HOOPS, SPIKE) want an
    // orthographic camera, for the reason in the header: nothing should
    // lean. A game played on a floor rather than on a plane - DUNK - wants
    // a real perspective camera, and gets one by passing `fov`. It then
    // drives the camera itself through `look()` and turns screen points
    // into floor points with `groundAt()`.
    const hw = this.units / 2, hh = hw * (this.H / this.W);
    if (o.fov) {
      this.persp = true;
      this.cam = new THREE.PerspectiveCamera(o.fov, this.W / this.H, 0.05, 600);
      this.cam.position.set(0, 8, 18);
      this.camTarget = new THREE.Vector3(0, 1.5, 0);
      this.cam.lookAt(this.camTarget);
      this.viewH = hh * 2;
      this.tilt = 0;
      this.camDist = 18;
      this._ray = new THREE.Raycaster();
    } else {
      this.cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 400);
      this.viewH = hh * 2;
      this.tilt = o.tilt || 0;
      this.camTarget = new THREE.Vector3(0, 0, 0);
      this.camDist = 100;
      this.lookAt(0, 0);
    }

    // ---- the light ---------------------------------------------------
    // Key from high front-left, warm; fill from low back-right, cold; and
    // a little ambient so nothing is ever pure black. The shadow camera
    // is sized to the play area rather than left at its default, which is
    // the difference between crisp shadows and a grey smudge.
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-26, 40, 34);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const S = this.units * 0.8;
    Object.assign(key.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 160 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.key = key;

    const fill = new THREE.DirectionalLight(0x9ec4ff, 0.75);
    fill.position.set(30, 14, -22);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x3a3326, 0.55));

    // ---- input, the same contract as the 2D cabinet -------------------
    this.keys = new Set();
    this.mouse = { x: this.W / 2, y: this.H / 2, down: false, wx: 0, wy: 0 };
    // MOUSE LOOK, for a game with the camera behind the player.
    //
    // A cursor has an edge and a camera angle does not, so a third-person
    // game cannot steer off the cursor's position: you run out of screen
    // halfway through a turn. What it steers off is how far the mouse
    // MOVED, which the browser only reports without limit while the
    // pointer is captured - hence pointer lock. See enableLook().
    this.locked = false;
    this.look2 = { dx: 0, dy: 0 };
    this._taps = 0; this._rels = 0;
    this.t = 0; this.dt = 0; this.frame = 0; this.paused = false;
    this.shot = /[?&]shot\b/.test(location.search);

    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.key); this.keys.add(e.code); }
      if (!e.repeat && (e.code === 'Space' || e.key === 'Enter')) this._taps++;
      if (e.key === 'p' || e.key === 'P') this.paused = !this.paused;
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key); this.keys.delete(e.code);
      if (e.code === 'Space' || e.key === 'Enter') this._rels++;
    });
    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      if (!p) return null;
      return { x: (p.clientX - r.left) / r.width * this.W,
               y: (p.clientY - r.top) / r.height * this.H };
    };
    const move = (e) => {
      const p = pos(e); if (!p) return;
      this.mouse.x = p.x; this.mouse.y = p.y;
      const w = this.toWorld(p.x, p.y);
      this.mouse.wx = w.x; this.mouse.wy = w.y;
    };
    const down = (e) => { move(e); this.mouse.down = true; this._taps++; this._audio();
      if (e.cancelable) e.preventDefault(); };
    const up = () => { this.mouse.down = false; this._rels++; };
    this.cv.addEventListener('mousemove', move);
    this.cv.addEventListener('mousedown', down);
    addEventListener('mouseup', up);
    this.cv.addEventListener('touchstart', down, { passive: false });
    this.cv.addEventListener('touchmove', (e) => { move(e); if (e.cancelable) e.preventDefault(); }, { passive: false });
    addEventListener('touchend', up);

    const fit = () => {
      const s = Math.min(innerWidth / this.W, innerHeight / this.H);
      this.cv.style.width = Math.floor(this.W * s) + 'px';
      this.cv.style.height = Math.floor(this.H * s) + 'px';
    };
    addEventListener('resize', fit); fit();
    // every key is released when focus goes - see the long note in deck.js
    const letGo = () => { this.keys.clear(); };
    addEventListener('blur', () => { this.paused = true; letGo(); });
    addEventListener('focus', letGo);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.paused = true; letGo(); } });
    addEventListener('pointerdown', () => { if (this.paused) this.paused = false; });

    // ---- the HUD ------------------------------------------------------
    // Text on a 3D scene wants to be text, not geometry. A second canvas
    // over the top, at the game's own pixel size, keeps the HUD sharp and
    // means these games can use the same hud()/card() calls as the rest.
    //
    // ITS BACKGROUND MUST BE TRANSPARENT. Setting a background on "canvas"
    // rather than on the game's own canvas is exactly the bug that made
    // LIGHTS OUT look like it was rendering nothing at all.
    this.hud2 = document.createElement('canvas');
    this.hud2.width = this.W; this.hud2.height = this.H;
    this.hud2.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;background:transparent';
    this.cv.style.position = 'relative';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;line-height:0';
    this.cv.parentNode.insertBefore(wrap, this.cv);
    wrap.appendChild(this.cv); wrap.appendChild(this.hud2);
    const fitHud = () => {
      this.hud2.style.width = this.cv.style.width;
      this.hud2.style.height = this.cv.style.height;
    };
    addEventListener('resize', fitHud); fitHud();
    this.g = this.hud2.getContext('2d');
  }



  /** put the camera on a point on the play plane, from the side */
  lookAt(x, y) {
    this.camTarget.set(x, y, 0);
    const d = this.camDist;
    this.cam.position.set(x, y + Math.sin(this.tilt) * d, Math.cos(this.tilt) * d);
    this.cam.lookAt(this.camTarget);
    if (this.key) {
      // the key light travels with the view, or a tall tower walks out of
      // its own shadow map halfway up
      this.key.position.set(x - 26, y + 40, 34);
      this.key.target.position.set(x, y, 0);
      this.key.target.updateMatrixWorld();
      this.scene.add(this.key.target);
    }
  }

  /**
   * Turn on mouse look.
   *
   * The lock is asked for on a click, because that is the only time a
   * browser will grant it, and it is asked for again on every click so
   * that pressing ESC and carrying on works the way a player expects.
   *
   * IT IS ALLOWED TO FAIL. Headless browsers refuse, some users refuse,
   * and a game that only works with the pointer captured is a game that
   * sometimes does not work - so 'locked' is public and the caller is
   * expected to have a fallback for when it is false.
   */
  enableLook(on = true) {
    // THE LOCK IS ONLY EVER ASKED FOR FROM A CLICK.
    //
    // Not from here. A browser grants pointer lock only inside a user
    // gesture, and "the player pressed the START button" is not one as
    // far as the DOM is concerned: these games read their buttons in the
    // animation frame, long after the click event has finished. Asking
    // here therefore always failed, and logged "A user gesture is
    // required to request Pointer Lock" into the console - which is how
    // tools/shots.mjs found it. The mousedown listener below is the only
    // place that can succeed, so it is the only place that asks.
    this._wantLock = on !== false;
    if (this._lookOn) return;
    this._lookOn = true;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.cv;
      this.look2.dx = 0; this.look2.dy = 0;
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
    this.cv.addEventListener('mousedown', () => {
      if (this._wantLock && !this.locked) this.cv.requestPointerLock && this.cv.requestPointerLock();
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look2.dx += e.movementX || 0;
      this.look2.dy += e.movementY || 0;
    });
  }

  /** how far the mouse has moved since this was last asked, in pixels */
  takeLook() {
    const d = { dx: this.look2.dx, dy: this.look2.dy };
    this.look2.dx = 0; this.look2.dy = 0;
    return d;
  }

  /** give the cursor back - for menus, and for the end of a game */
  releaseLook() {
    this._wantLock = false;
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  /** put a perspective camera somewhere and point it at something */
  look(pos, target) {
    this.cam.position.copy(pos);
    this.camTarget.copy(target);
    this.cam.lookAt(target);
    if (this.key) {
      // the shadow camera follows the action, or half the court is
      // outside the map and nothing over there has a shadow
      this.key.position.set(target.x - 9, target.y + 16, target.z + 11);
      this.key.target.position.copy(target);
      this.key.target.updateMatrixWorld();
      this.scene.add(this.key.target);
    }
  }

  /**
   * Where a screen point lands on a horizontal plane.
   *
   * This is the whole of mouse aiming in a 3D game played on a floor:
   * the pointer is not a position in the world, it is a RAY, and the
   * thing the player means by it is where that ray meets the ground.
   */
  groundAt(px, py, y = 0, out) {
    const ndc = new THREE.Vector2((px / this.W) * 2 - 1, -((py / this.H) * 2 - 1));
    this._ray.setFromCamera(ndc, this.cam);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    const v = out || new THREE.Vector3();
    if (Math.abs(d.y) < 1e-6) return v.set(o.x, y, o.z);
    const t = (y - o.y) / d.y;
    return v.set(o.x + d.x * t, y, o.z + d.z * t);
  }

  /** screen pixels -> world units on the play plane */
  toWorld(px, py) {
    const hw = this.units / 2, hh = hw * (this.H / this.W);
    return { x: this.camTarget.x + (px / this.W - 0.5) * hw * 2,
             y: this.camTarget.y - (py / this.H - 0.5) * hh * 2 };
  }
  /** world units -> screen pixels */
  toScreen(wx, wy) {
    const hw = this.units / 2, hh = hw * (this.H / this.W);
    return { x: ((wx - this.camTarget.x) / (hw * 2) + 0.5) * this.W,
             y: (0.5 - (wy - this.camTarget.y) / (hh * 2)) * this.H };
  }

  /**
   * Resize the shadow map's view of the world.
   *
   * The default is fitted to a side-on game's play area. An arena is
   * bigger than that, and a shadow camera that does not cover the court
   * is a court where players stop having shadows halfway down it.
   */
  setShadowArea(size, far = 60) {
    const c = this.key.shadow.camera;
    c.left = -size; c.right = size; c.top = size; c.bottom = -size;
    c.near = 0.5; c.far = far;
    c.updateProjectionMatrix();
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.needsUpdate = true;
  }

  tapped() { const n = this._taps; this._taps = 0; return n; }
  released() { const n = this._rels; this._rels = 0; return n; }
  held(...k) { return k.some((x) => this.keys.has(x)); }

  get best() { try { return +localStorage.getItem('pd.best.' + this.keyName) || 0; } catch (e) { return 0; } }
  set best(v) { try { localStorage.setItem('pd.best.' + this.keyName, String(Math.round(v))); } catch (e) {} }
  record(s) { if (s > this.best) { this.best = s; return true; } return false; }

  _audio() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  beep(f = 440, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.12, vol = 0.06, hp = 700) {
    if (!this.ac) return;
    const n = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(); s.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.ac.destination); s.start();
  }

  run(step) {
    let last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 1 / 20) dt = 1 / 20;
      this.g.clearRect(0, 0, this.W, this.H);
      if (this.paused) { this._pauseCard(); return; }
      this.dt = dt; this.t += dt; this.frame++;
      step(dt);
      this.renderer.render(this.scene, this.cam);
    };
    requestAnimationFrame(tick);
  }

  _pauseCard() {
    this.g.fillStyle = 'rgba(6,9,13,.72)'; this.g.fillRect(0, 0, this.W, this.H);
    this.text('PAUSED', this.W / 2, this.H / 2 - 6, 20, '#e7ecf3', 'center');
    this.text('click to carry on', this.W / 2, this.H / 2 + 18, 11, '#8b96a8', 'center');
  }

  // ---- the same HUD helpers the 2D games have ------------------------
  text(s, x, y, size = 12, col = '#e7ecf3', align = 'left') {
    const g = this.g;
    g.fillStyle = col;
    g.font = '700 ' + size + 'px ui-monospace,Menlo,Consolas,monospace';
    g.textAlign = align; g.fillText(s, x, y); g.textAlign = 'left';
  }
  hud(left, right) {
    const g = this.g;
    g.fillStyle = 'rgba(6,9,13,.45)'; g.fillRect(0, 0, this.W, 30);
    this.text(left, 12, 20, 13, '#e7ecf3');
    this.text(right, this.W - 12, 20, 12, '#cbd6e4', 'right');
  }
  card(title, lines, sub) {
    const g = this.g;
    g.fillStyle = 'rgba(6,9,13,.78)'; g.fillRect(0, 0, this.W, this.H);
    let y = this.H / 2 - 40;
    this.text(title, this.W / 2, y, 26, '#ff9f43', 'center'); y += 30;
    for (const l of lines) { this.text(l, this.W / 2, y, 13, '#e7ecf3', 'center'); y += 20; }
    if (sub) this.text(sub, this.W / 2, this.H / 2 + 62, 11, '#8b96a8', 'center');
  }
}

// ---- material and mesh helpers every 3D game here wants --------------

/** a flat, unshiny material - the only kind these games use */
export const mat = (col, opts = {}) => new THREE.MeshLambertMaterial(
  Object.assign({ color: new THREE.Color(col) }, opts));

/** a box that casts and receives, which is 90% of what gets built */
export function box(w, h, d, material, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  return m;
}

export function sphere(r, material, seg = 18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cyl(rt, rb, h, material, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * A canvas texture, painted by hand.
 *
 * Same idea as LIGHTS OUT's: no image files anywhere, so a game folder is
 * source and nothing else, and the art is version-controlled as code.
 */
export function paint(w, h, draw, filter = 'nearest') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (filter === 'nearest') { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
