// =====================================================================
// HIGHRISE :: blood.js - THE VIOLENCE
// =====================================================================
//
// Liam: *"a very brutal violent with realistic blood physics and effects
// to make this game a quick john wick fight sequence type of game"*, and
// earlier *"very violent bloods splatters and droplets"*.
//
// "Realistic blood physics" is a real request with a real answer, and the
// answer is not more red particles. What makes screen violence read is
// that blood is FIVE different things, and a scene only looks violent
// when all five are present:
//
//   1. SPRAY      a cone of fast droplets off the far side of the hit.
//                 Half a second. This is the hit REGISTERING.
//   2. DROPLETS   the ones that survive the spray, fall under gravity,
//                 and STICK WHERE THEY LAND - on the floor and, more
//                 importantly, up the WALLS. Wall spatter is the single
//                 biggest thing the old version was missing: everything
//                 landed on the floor, so a room never looked like
//                 anything had happened at head height in it.
//   3. POOLS      spreading under anything that stopped moving, growing
//                 for several seconds afterwards.
//   4. TRAILS     smears where a body slid or was dragged.
//   5. THE LENS   blood on the camera when you kill somebody close
//                 enough to wear it. This is the one that makes a knife
//                 kill feel different from a shot across a room.
//
// The droplets collide against the FLOOR GRID rather than against the
// solid list: a floor is a thousand boxes and a particle system cannot
// afford to ask all of them, but the plan already knows which cells are
// wall in constant time. That is also what makes wall spatter possible
// at all, because the grid gives the face that was crossed and therefore
// the normal to stick the decal to.
import * as THREE from '../vendor/three.module.js';
import { toCell, toWorld, CELL, W, D, EMPTY } from './plan.js';
import { rng } from './rng.js';

const WALL_H = 3.0;

// ---------------------------------------------------------------------
// the splat shapes
// ---------------------------------------------------------------------
function splatTexture(seed, spread) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const r = rng(seed);
  x.clearRect(0, 0, S, S);
  // ONE RAGGED BLOB AND A SCATTER OF SATELLITES. A splash is never a
  // circle, and a circle is exactly what reads as "particle effect".
  x.fillStyle = '#6d0b07';
  x.beginPath();
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const rad = S * (0.13 + r.range(0, 0.13) + Math.sin(a * 3.1 + seed) * 0.05);
    const px = S/2 + Math.cos(a) * rad, py = S/2 + Math.sin(a) * rad * (1 / spread);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath(); x.fill();
  // a few fingers running off it, which is what a real splash does
  for (let i = 0; i < 7; i++) {
    const a = r.range(0, 7), d = r.range(S * 0.14, S * 0.30);
    x.strokeStyle = 'rgba(109,11,7,0.85)';
    x.lineWidth = r.range(2, 6);
    x.beginPath();
    x.moveTo(S/2, S/2);
    x.lineTo(S/2 + Math.cos(a) * d, S/2 + Math.sin(a) * d);
    x.stroke();
  }
  for (let i = 0; i < 46; i++) {
    const a = r.range(0, 7), d = r.range(S * 0.18, S * 0.47);
    x.fillStyle = 'rgba(120,14,9,' + r.range(0.45, 1).toFixed(2) + ')';
    x.beginPath();
    x.arc(S/2 + Math.cos(a) * d, S/2 + Math.sin(a) * d, r.range(0.9, 4.2), 0, 7);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------
export class Blood {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // ---- the airborne droplets, one buffer -------------------------
    const N = 1400;
    this.N = N; this.n = 0;
    this.pos = new Float32Array(N * 3).fill(-999);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.big = new Float32Array(N);
    // WHICH STOREY EACH DROPLET IS FALLING ONTO. Derived, not passed:
    // spray() is given an absolute height, and the slab under it is that
    // height rounded down to a storey. Every call site got this right for
    // free the moment the building became physical.
    this.gnd = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9c0d08, size: 0.05, sizeAttenuation: true, depthWrite: false }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);

    // ---- decals ------------------------------------------------------
    this.tex = [0, 1, 2, 3].map((i) => splatTexture(4242 + i * 977, 1));
    this.mat = this.tex.map((t) => new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false, opacity: 0.95,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.dark = new THREE.MeshBasicMaterial({
      map: this.tex[0], transparent: true, depthWrite: false, opacity: 0.95,
      color: 0x6a4038, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    // ---- BLOOD DOES NOT GO AWAY --------------------------------------
    //
    // Liam: *"don't make blood dissappear"*.
    //
    // It was 320 separate meshes in a ring, and the ring is what he was
    // watching: mark 321 deleted mark 1, so a long fight quietly cleaned
    // up after itself and the room you had just shot your way through
    // looked untouched by the time you left it.
    //
    // The cap was there for a real reason - 320 meshes is 320 draw calls
    // and the decal group was becoming the frame time. Raising the number
    // would have made that worse, so the storage changed instead: five
    // InstancedMeshes, one per splat texture, drawn in FIVE draw calls no
    // matter how many marks are in them. That is fewer than the ring cost
    // at 320 and it holds 7,500 - about twenty-five times the blood, for
    // about a sixtieth of the cost.
    //
    // There is still a ceiling, because an unbounded one is a memory leak
    // with extra steps. At 1,500 per texture you would have to kill some
    // thousands of men on one visit to reach it.
    this.MAX = 1500;
    this.decals = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.quad = quad;
    this._dummy = new THREE.Object3D();
    this._banks = null;          // built lazily, once the materials exist

    // ---- pools, which grow ------------------------------------------
    this.pools = [];

    // ---- the lens ----------------------------------------------------
    this.lens = document.getElementById('lens');
    this.lensAmt = 0;
    if (this.lens) {
      // Drawn once, at four times the screen, and SCROLLED rather than
      // redrawn - so every kill wears a different part of it and it never
      // repeats visibly, for the cost of one texture.
      const S = 512;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
      const rr = rng(9182);
      for (let i = 0; i < 90; i++) {
        const px = rr.range(0, S), py = rr.range(0, S), rad = rr.range(2, 26);
        const g = x.createRadialGradient(px, py, 0, px, py, rad);
        // MULTIPLY, so it darkens and tints instead of painting over. A
        // red overlay at any opacity reads as a filter; a multiply reads
        // as something ON the glass.
        g.addColorStop(0, 'rgba(120,10,8,0.95)');
        g.addColorStop(0.7, 'rgba(150,30,24,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
        // a run, because blood on glass runs
        if (rr.chance(0.3)) {
          x.strokeStyle = 'rgba(140,20,16,0.5)'; x.lineWidth = rr.range(1, 4);
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + rr.range(-3, 3), py + rr.range(8, 46));
          x.stroke();
        }
      }
      this.lens.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
      this.lens.style.backgroundSize = '100% 100%';
    }
  }

  // -------------------------------------------------------------------
  // One bank per material. Built on the first mark rather than in the
  // constructor, so a material that is never used never allocates.
  bank(mat) {
    if (!this._banks) this._banks = new Map();
    let b = this._banks.get(mat);
    if (!b) {
      const im = new THREE.InstancedMesh(this.quad, mat, this.MAX);
      im.count = 0;
      // Every mark in the tower lives in one object, so its bounds span
      // eleven storeys and culling it as a unit is meaningless - and a
      // wrong cull here means a whole floor's blood vanishing at once,
      // which is the bug this rewrite exists to remove.
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      b = { im, i: 0 };
      this._banks.set(mat, b);
    }
    return b;
  }

  place(p, normal, size, mat, rot) {
    const b = this.bank(mat);
    const d = this._dummy;
    d.position.copy(p).addScaledVector(normal, 0.008 + Math.random() * 0.004);
    d.lookAt(d.position.clone().add(normal));
    d.rotateZ(rot === undefined ? Math.random() * 6.283 : rot);
    d.scale.set(size, size * (0.7 + Math.random() * 0.6), 1);
    d.updateMatrix();
    const k = b.i % this.MAX;
    b.im.setMatrixAt(k, d.matrix);
    b.im.instanceMatrix.needsUpdate = true;
    b.i++;
    if (b.im.count < this.MAX) b.im.count = b.i;
    // A HANDLE ON ONE INSTANCE, not the bank. A pool spreads and a trail
    // is stretched after the fact, and when place() returned a Mesh those
    // callers just set .scale on it. Returning the InstancedMesh here
    // would have had them rescale every mark sharing that texture - one
    // body bleeding out would have swollen all the blood in the tower.
    return { im: b.im, k, p: d.position.clone(), q: d.quaternion.clone() };
  }

  /** restretch a mark that place() already put down */
  reshape(h, sx, sy) {
    if (!h || !h.im) return;
    const d = this._dummy;
    d.position.copy(h.p); d.quaternion.copy(h.q); d.scale.set(sx, sy, 1);
    d.updateMatrix();
    h.im.setMatrixAt(h.k, d.matrix);
    h.im.instanceMatrix.needsUpdate = true;
  }

  /**
   * A mark on the floor - of a particular STOREY.
   *
   * The building is physical now (building.js), so "the floor" is not a
   * fixed plane at zero any more. Every mark carries the altitude of the
   * slab it landed on, or blood spilled on floor six pools in the lobby.
   */
  floor(x, z, size, base = 0) {
    // 2 cm off the carpet, for the same depth-precision reason the bullet
    // holes are 3 cm off a wall - see main.js. At 4 mm these were losing
    // the depth test and half the blood in the game was not drawing.
    this.place(new THREE.Vector3(x, base + 0.02, z), UP, size,
               this.mat[(Math.random() * 4) | 0]);
  }

  /**
   * THE HIT. `dir` is the way the bullet was going, so the cone comes off
   * the FAR side - blood coming back at the camera reads as a hit marker
   * rather than as damage.
   */
  spray(x, y, z, dx, dy, dz, amount = 24, force = 1) {
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    for (let i = 0; i < amount; i++) {
      const k = this.n = (this.n + 1) % this.N;
      this.pos[k*3] = x; this.pos[k*3+1] = y; this.pos[k*3+2] = z;
      this.gnd[k] = Math.floor((y + 0.02) / WALL_H) * WALL_H;
      const sp = (2.0 + Math.random() * 7.5) * force;
      // A TIGHT CORE AND A WIDE FRINGE. A uniform cone is a shower head.
      const spread = Math.random() < 0.4 ? 0.25 : 1.1;
      this.vel[k*3]   = (dx + (Math.random() - 0.5) * spread) * sp;
      this.vel[k*3+1] = (dy + (Math.random() - 0.5) * spread) * sp + 1.2 + Math.random() * 2.6;
      this.vel[k*3+2] = (dz + (Math.random() - 0.5) * spread) * sp;
      this.life[k] = 0.7 + Math.random() * 1.1;
      this.big[k] = Math.random() < 0.12 ? 1 : 0;      // a few fat ones
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }

  /** a body that has stopped moving keeps bleeding */
  pool(x, z, max = 1.9, base = 0) {
    const m = this.place(new THREE.Vector3(x, base + 0.018, z), UP, 0.25, this.dark);
    this.pools.push({ m, r: 0.25, max, x, z });
    if (this.pools.length > 40) this.pools.shift();
  }

  /** a smear, in a direction - a body sliding, or being dragged */
  trail(x, z, ang, size = 0.5, base = 0) {
    const m = this.place(new THREE.Vector3(x, base + 0.022, z), UP, size, this.dark, ang);
    this.reshape(m, size * 0.5, size * 1.7);
  }

  /**
   * BLOOD ON THE LENS, when you are close enough to wear it. This is what
   * makes a knife kill feel different from a shot down a corridor, and
   * it is the single cheapest way to make the player feel implicated.
   */
  onLens(dist, amount = 1) {
    if (!this.lens || dist > 2.6) return;
    const k = (1 - dist / 2.6) * amount;
    // CAPPED WELL BELOW OPAQUE, and it dries fast. The first build let it
    // accumulate to 1.0 and a firefight ended with the screen a solid
    // sheet of red you could not see or aim through - which is not
    // atmosphere, it is a blindfold.
    this.lensAmt = Math.min(0.45, this.lensAmt + k * 0.22);
    this.lens.style.opacity = this.lensAmt.toFixed(3);
    // a fresh set of droplets, so it is never the same mask twice
    this.lens.style.backgroundPosition =
      (Math.random() * 100).toFixed(0) + '% ' + (Math.random() * 100).toFixed(0) + '%';
  }

  // -------------------------------------------------------------------
  step(dt, P) {
    // ---- droplets ----------------------------------------------------
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i*3+1] -= 24 * dt;
      const ox = this.pos[i*3], oy = this.pos[i*3+1], oz = this.pos[i*3+2];
      const nx = ox + this.vel[i*3] * dt;
      const ny = oy + this.vel[i*3+1] * dt;
      const nz = oz + this.vel[i*3+2] * dt;
      const size = (this.big[i] ? 0.42 : 0.13) + Math.random() * 0.20;

      const g = this.gnd[i];
      if (ny <= g + 0.02) {
        this.floor(nx, nz, size, g);
        this.kill(i);
        continue;
      }
      if (ny >= g + WALL_H - 0.04) {
        this.place(new THREE.Vector3(nx, g + WALL_H - 0.02, nz), DOWN, size, this.mat[(Math.random()*4)|0]);
        this.kill(i);
        continue;
      }
      // ---- WALLS. The grid answers in constant time, and it also says
      // WHICH FACE was crossed, which is the normal the decal needs.
      if (P) {
        const [cx, cz] = toCell(nx, nz);
        if (cx < 0 || cz < 0 || cx >= W || cz >= D || P.at(cx, cz) !== EMPTY) {
          const [ox2, oz2] = toCell(ox, oz);
          let nrm = null, px = nx, pz = nz;
          if (cx !== ox2) {
            const s = cx > ox2 ? -1 : 1;
            nrm = new THREE.Vector3(s, 0, 0);
            px = toWorld(cx, cz)[0] + s * CELL / 2;
          } else if (cz !== oz2) {
            const s = cz > oz2 ? -1 : 1;
            nrm = new THREE.Vector3(0, 0, s);
            pz = toWorld(cx, cz)[1] + s * CELL / 2;
          }
          if (nrm) {
            this.place(new THREE.Vector3(px, ny, pz), nrm, size, this.mat[(Math.random()*4)|0]);
            this.kill(i);
            continue;
          }
        }
      }
      this.pos[i*3] = nx; this.pos[i*3+1] = ny; this.pos[i*3+2] = nz;
      if (this.life[i] <= 0) this.kill(i);
    }
    this.pts.geometry.attributes.position.needsUpdate = true;

    // ---- pools spread -------------------------------------------------
    for (const p of this.pools) {
      if (p.r >= p.max) continue;
      p.r = Math.min(p.max, p.r + dt * 0.30);
      this.reshape(p.m, p.r, p.r * 0.85);
    }

    // ---- the lens dries -----------------------------------------------
    if (this.lensAmt > 0) {
      this.lensAmt = Math.max(0, this.lensAmt - dt * 0.42);
      if (this.lens) this.lens.style.opacity = this.lensAmt.toFixed(3);
    }
  }

  kill(i) {
    this.life[i] = 0;
    this.pos[i*3+1] = -999;
  }

  clear() {
    if (this._banks) for (const b of this._banks.values()) { b.i = 0; b.im.count = 0; }
    this.decals = []; this.pools = [];
    for (let i = 0; i < this.N; i++) this.kill(i);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
