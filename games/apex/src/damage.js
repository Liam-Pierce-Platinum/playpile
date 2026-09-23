// =====================================================================
// APEX :: damage.js - WHAT A CRASH DOES TO A CAR
// =====================================================================
//
// Liam: "make it have damage so that tires can pop there can be dents
// scratch marks sparks etc etc and just full breaking off of parts".
//
// world.js reports every contact - with a barrier or with another car -
// as WHERE on the car it was (metres forward and left of the centre of
// mass) and HOW HARD: `vn` is the speed into the thing it hit, `vt` the
// speed sliding along it. Everything here is decided from those two.
//
//   sliding along anything      sparks and scratches in the paint
//   a hit (vn over ~2.5 m/s)    a dent, pushed into the bodywork where it hit
//   at the nose                 an endplate off, then the whole front wing
//   at the tail                 the rear wing
//   along the side              a mirror
//   at a wheel                  the tyre loses pressure and goes flat; a
//                               flat run far enough shreds to the rim; a
//                               big enough hit takes the wheel off
//
// And what it costs, which is honest, not a health bar: a missing front
// wing is front downforce gone (understeer), a missing rear wing is rear
// downforce gone (oversteer, and it is quicker on the straights), a flat
// tyre has a third of its grip and drags, a wheel that is not there drags
// that corner along the ground. car.js reads it all from `car.dmg`.
//
// A pit stop mends it. Pressing R does not.
import * as THREE from '../vendor/three.module.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// wheel order as car.js: 0 front-right, 1 front-left, 2 rear-right, 3 rear-left
const WHEEL_AT = [[1.96, -1.0], [1.96, 1.0], [-1.64, -1.0], [-1.64, 1.0]];
export const WHEEL_NAME = ['FRONT RIGHT', 'FRONT LEFT', 'REAR RIGHT', 'REAR LEFT'];

/** a flat tyre runs this far before it is off the rim */
const SHRED_AFTER = 900;

export class Damage {
  constructor(runner) {
    this.r = runner;
    this.reset();
  }

  reset() {
    // tyre: 'ok' | 'flat' | 'rim' | 'off'. hp is what a wheel can still take
    this.tyre = ['ok', 'ok', 'ok', 'ok'];
    this.hp = [1, 1, 1, 1];
    this.flatRun = [0, 0, 0, 0];
    this.bent = [0, 0, 0, 0];
    this.parts = { fwing: true, epL: true, epR: true, rwing: true, mirL: true, mirR: true };
    this.dents = 0;
    this.scratchT = 0;
    this.messages = [];          // for the player: 'FRONT WING DAMAGE' etc
    this.apply();
  }

  /** anything missing or broken, as short words - for the HUD and the robots */
  get summary() {
    const s = [];
    if (!this.parts.fwing) s.push('front wing'); else if (!this.parts.epL || !this.parts.epR) s.push('endplate');
    if (!this.parts.rwing) s.push('rear wing');
    this.tyre.forEach((t, k) => { if (t !== 'ok') s.push(WHEEL_NAME[k].toLowerCase() + ' ' + (t === 'off' ? 'wheel' : t)); });
    return s;
  }

  /** is it bad enough to come in for? */
  get needsPit() {
    return !this.parts.fwing || !this.parts.rwing || this.tyre.some((t) => t !== 'ok');
  }

  /** is the car finished - a wheel gone? (flats and rims can limp to the pits) */
  get terminal() {
    return this.tyre.some((t) => t === 'off');
  }

  /** write what is broken into the numbers car.js drives with */
  apply() {
    const d = this.r.car.dmg, P = this.parts;
    d.aeroF = P.fwing ? 1 - (P.epL ? 0 : 0.09) - (P.epR ? 0 : 0.09) : 0.30;
    d.aeroR = P.rwing ? 1 : 0.35;
    d.drag = P.rwing ? 0 : -0.14;
    d.drag += Math.min(0.05, this.dents * 0.004);
    // a front wing missing ON ONE SIDE pulls the car towards that side
    let pull = 0;
    if (P.fwing) pull += (P.epL ? 0 : 0.004) - (P.epR ? 0 : 0.004);
    for (let k = 0; k < 4; k++) {
      const t = this.tyre[k];
      d.grip[k] = t === 'ok' ? 1 : t === 'flat' ? 0.38 : t === 'rim' ? 0.18 : 0;
      d.scrape[k] = t === 'ok' ? 0 : t === 'flat' ? 0.06 : t === 'rim' ? 0.35 : 0.9;
      pull += this.bent[k] * (k % 2 ? 1 : -1);
    }
    d.pull = clamp(pull, -0.03, 0.03);
  }

  /** a pit crew: new wings, new wheels, straightened arms. Dents and scratches stay. */
  mend() {
    for (const k of Object.keys(this.parts)) this.parts[k] = true;
    this.tyre = ['ok', 'ok', 'ok', 'ok'];
    this.hp = [1, 1, 1, 1];
    this.flatRun = [0, 0, 0, 0];
    this.bent = [0, 0, 0, 0];
    this.apply();
  }

  /**
   * One contact. Returns what happened, for the effects: { dent, scratch,
   * sparks, off: [part names], wheelOff: k | -1, flat: k | -1, shards }.
   */
  impact(imp) {
    const out = { dent: 0, scratch: false, sparks: 0, off: [], wheelOff: -1, flat: -1, shards: 0 };
    const car = imp.other ? 'car' : 'wall';
    // Two cars that touch SHARE the blow: each one's velocity changes by about
    // half the closing speed, where a car into a wall takes all of it
    const hard = car === 'car' ? imp.vn * 0.5 : imp.vn;
    const slide = imp.vt;
    this.scratchT -= 1 / 60;

    // ---- sparks and scratches: anything moving against anything ------------
    out.sparks = car === 'wall' ? hard * 5 + slide * 0.35 : hard * 3 + slide * 0.5;
    if (out.sparks < 2) out.sparks = 0;
    if ((hard > 0.8 || slide > 4) && this.scratchT <= 0) { out.scratch = true; this.scratchT = 0.1; }

    // ---- a real hit ----------------------------------------------------------
    if (hard > 2.5) {
      out.dent = Math.min(0.09, (hard - 2.5) * 0.006 + 0.012);
      this.dents++;
      out.shards = Math.floor((hard - 2) * 0.8);
    }
    const P = this.parts;
    const side = imp.left >= 0 ? 'L' : 'R';
    const k2 = 1;
    // THE NOSE: the endplate on that side, then the wing
    if (imp.fwd > 1.7 && P.fwing) {
      if (P['ep' + side] && hard > 3.5 * k2) { P['ep' + side] = false; out.off.push('ep' + side); }
      if (hard > 9 * k2 || (!P.epL && !P.epR && hard > 5 * k2)) {
        P.fwing = false; out.off.push('fwing');
        for (const e of ['epL', 'epR']) if (P[e]) { P[e] = false; out.off.push(e); }
        this.messages.push('FRONT WING GONE');
      } else if (out.off.length) this.messages.push('FRONT WING DAMAGE');
    }
    // THE TAIL
    if (imp.fwd < -1.9 && P.rwing && hard > 8.5 * k2) { P.rwing = false; out.off.push('rwing'); this.messages.push('REAR WING GONE'); }
    // A MIRROR, from anything along the side at the cockpit
    if (Math.abs(imp.fwd - 0.8) < 1.0 && Math.abs(imp.left) > 0.6 && P['mir' + side] && hard > 3) {
      P['mir' + side] = false; out.off.push('mir' + side);
    }
    // THE WHEELS
    for (let k = 0; k < 4; k++) {
      const [wf, wl] = WHEEL_AT[k];
      if (Math.hypot(imp.fwd - wf, (imp.left - wl) * 0.8) > 0.85) continue;
      if (this.tyre[k] === 'off') continue;
      // wheel against wheel is the classic puncture
      // HITS puncture, scraping does not: contact is reported every frame it
      // lasts, and a charge per frame for sliding gave a flat in ten frames of
      // brushing a wall - a whole grid of flats after a wet first lap
      const bite = Math.max(0, hard - 2.5) * 0.09;
      this.hp[k] -= bite;
      if (hard > 4) this.bent[k] = clamp(this.bent[k] + (hard - 4) * 0.0015, 0, 0.02);
      if (hard > 17) {
        this.tyre[k] = 'off'; out.wheelOff = k;
        this.messages.push('LOST THE ' + WHEEL_NAME[k] + ' WHEEL');
      } else if (this.tyre[k] === 'ok' && this.hp[k] < 0.5) {
        this.tyre[k] = 'flat'; out.flat = k;
        this.messages.push('PUNCTURE · ' + WHEEL_NAME[k]);
      }
    }
    if (out.off.length || out.wheelOff >= 0 || out.flat >= 0 || hard > 2.5) this.apply();
    return out;
  }

  /**
   * Every frame: a flat tyre shreds off the rim if it is run far enough,
   * and a worn-out tyre can let go on its own. Returns a wheel that just
   * shredded, or -1.
   */
  step(dt) {
    const car = this.r.car;
    let shred = -1;
    for (let k = 0; k < 4; k++) {
      if (this.tyre[k] === 'flat') {
        this.flatRun[k] += car.speed * dt;
        if (this.flatRun[k] > SHRED_AFTER) { this.tyre[k] = 'rim'; shred = k; this.apply(); }
      } else if (this.tyre[k] === 'ok' && car.wheels[k].wear <= 0.02 && car.speed > 20 && Math.random() < dt * 0.4) {
        this.tyre[k] = 'flat';
        this.messages.push('PUNCTURE · ' + WHEEL_NAME[k] + ' · WORN THROUGH');
        this.apply();
      }
    }
    return shred;
  }
}

// =====================================================================
// THE BODYWORK: DENTS AND SCRATCHES
// =====================================================================
//
// The painted body geometry and the livery texture are SHARED by every car
// with the same livery. So the first time a car is marked it is given its
// own copy of each, and only that car changes. A car reused next session
// is put back by art.repair().
const _v = new THREE.Vector3();

/** the model-space point on the painted body nearest a contact at (fwd, left) */
function nearestPaint(art, fwd, left, heightAboveRoad) {
  const pos = art.bodyPaint.geometry.attributes.position;
  // model space: +X left, +Z forward, road at y = -R
  const tx = left * 0.8, ty = -art.R + heightAboveRoad, tz = fwd;
  let best = -1, bd = Infinity;
  const a = pos.array;
  for (let i = 0; i < pos.count; i += 3) {
    const dx = a[i * 3] - tx, dy = a[i * 3 + 1] - ty, dz = a[i * 3 + 2] - tz;
    const d = dx * dx + dy * dy * 0.5 + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** push the bodywork in round a contact */
export function dent(art, fwd, left, depth) {
  if (art.bodyPaint.geometry === art.sharedPaint) art.bodyPaint.geometry = art.sharedPaint.clone();
  const geo = art.bodyPaint.geometry;
  const pos = geo.attributes.position, nor = geo.attributes.normal, a = pos.array, na = nor.array;
  const c = nearestPaint(art, fwd, left, 0.35 + Math.random() * 0.2);
  if (c < 0) return;
  const cx = a[c * 3], cy = a[c * 3 + 1], cz = a[c * 3 + 2];
  const rad = 0.22 + depth * 3;
  const touched = [];
  for (let i = 0; i < pos.count; i++) {
    const dx = a[i * 3] - cx, dy = a[i * 3 + 1] - cy, dz = a[i * 3 + 2] - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > rad) continue;
    // a crumple, not a smooth bowl: the falloff is lumpy
    const f = (1 - d / rad) ** 1.6 * depth * (0.75 + 0.5 * Math.abs(Math.sin(a[i * 3] * 37 + a[i * 3 + 2] * 23)));
    a[i * 3] -= na[i * 3] * f; a[i * 3 + 1] -= na[i * 3 + 1] * f; a[i * 3 + 2] -= na[i * 3 + 2] * f;
    touched.push(i - (i % 3));
  }
  // RE-LIGHT THE DENT. The body is smooth-shaded from shared normals, and a
  // pushed-in surface keeping its old normals would look untouched. So the
  // triangles that moved get fresh face normals, averaged over every copy
  // of the same corner, which keeps the rest of the car smooth.
  const acc = new Map();
  const key = (i) => Math.round(a[i * 3] * 500) + ',' + Math.round(a[i * 3 + 1] * 500) + ',' + Math.round(a[i * 3 + 2] * 500);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const tris = [...new Set(touched)];
  for (const t of tris) {
    A.fromArray(a, t * 3); B.fromArray(a, (t + 1) * 3); C.fromArray(a, (t + 2) * 3);
    const n = B.sub(A).cross(C.sub(A));
    for (let j = 0; j < 3; j++) {
      const k = key(t + j);
      const s = acc.get(k) || acc.set(k, new THREE.Vector3()).get(k);
      s.add(n);
    }
  }
  for (const t of tris) {
    for (let j = 0; j < 3; j++) {
      const s = acc.get(key(t + j));
      if (!s || s.lengthSq() < 1e-12) continue;
      _v.copy(s).normalize();
      na[(t + j) * 3] = _v.x; na[(t + j) * 3 + 1] = _v.y; na[(t + j) * 3 + 2] = _v.z;
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  art.dents = (art.dents || 0) + 1;
}

/** scratch the paint round a contact: scores along the car, bare carbon showing */
export function scratch(art, fwd, left, strength) {
  if (!art.ownPaint) {
    const src = art.liveryMat.map.image;
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    art.ownPaint = art.liveryMat.clone();
    art.ownPaint.map = tex;
    art.canvas = cv;
    art.group.traverse((o) => { if (o.userData.paint) o.material = art.ownPaint; });
  }
  const i = nearestPaint(art, fwd, left, 0.3 + Math.random() * 0.3);
  if (i < 0) return;
  const uv = art.bodyPaint.geometry.attributes.uv;
  const W = art.canvas.width;
  const px = uv.getX(i) * W, py = (1 - uv.getY(i)) * W;
  const g = art.canvas.getContext('2d');
  // Along the car is up the texture (v is metres along z), so a scrape
  // along a wall is a bundle of near-vertical scores
  const n = 3 + Math.floor(strength * 6);
  for (let k = 0; k < n; k++) {
    const x = px + (Math.random() - 0.5) * 34, y = py + (Math.random() - 0.5) * 40;
    const len = 18 + Math.random() * 60 * (0.5 + strength);
    const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    g.strokeStyle = Math.random() < 0.6 ? 'rgba(20,20,22,0.75)' : 'rgba(210,210,205,0.55)';
    g.lineWidth = 0.8 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  art.ownPaint.map.needsUpdate = true;
}

// =====================================================================
// DEBRIS
// =====================================================================
//
// A part that comes off is a copy of that part thrown down the road with
// the car's speed, spinning, bouncing and sliding to a stop - and it stays
// where it stops for the rest of the session, the same as the tyre marks.
// Shards are small splinters of carbon from any real hit.
const MAX_DEBRIS = 260;

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    const shardGeo = new THREE.BufferGeometry();
    shardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.09, 0, -0.05, 0.1, 0, -0.03, 0.01, 0, 0.12, -0.09, 0.012, -0.05, 0.1, 0.012, -0.03, 0.01, 0.012, 0.12]), 3));
    shardGeo.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
    shardGeo.computeVertexNormals();
    this.shardGeo = shardGeo;
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.3 });
  }

  /** throw an object into the world from where it sits on the car */
  throw(obj, vx, vz, kick, groundY, halfH = 0.2) {
    obj.updateWorldMatrix(true, false);
    const m = obj.matrixWorld.clone();
    const piece = obj.clone(true);
    piece.visible = true;
    m.decompose(piece.position, piece.quaternion, piece.scale);
    piece.traverse((o) => { o.castShadow = true; o.frustumCulled = true; });
    this.scene.add(piece);
    this.add(piece, vx, vz, kick, groundY, halfH);
    return piece;
  }

  shards(x, y, z, vx, vz, n, groundY, nx = 0, nz = 0) {
    for (let k = 0; k < Math.min(n, 14); k++) {
      const s = new THREE.Mesh(this.shardGeo, this.shardMat);
      const sc = 0.35 + Math.random() * 0.8;
      s.scale.set(sc, 1, sc * (0.5 + Math.random()));
      s.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
      s.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.castShadow = false;
      this.scene.add(s);
      this.add(s, vx * (0.4 + Math.random() * 0.5) + nx * Math.random() * 6, vz * (0.4 + Math.random() * 0.5) + nz * Math.random() * 6, 4, groundY, 0.02);
    }
  }

  add(obj, vx, vz, kick, groundY, halfH) {
    this.list.push({
      obj, halfH, ground: groundY,
      v: new THREE.Vector3(vx + (Math.random() - 0.5) * kick, 2 + Math.random() * kick, vz + (Math.random() - 0.5) * kick),
      w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      rest: false,
    });
    while (this.list.length > MAX_DEBRIS) {
      const old = this.list.shift();
      this.scene.remove(old.obj);
    }
  }

  step(dt) {
    const q = new THREE.Quaternion(), ax = new THREE.Vector3();
    for (const d of this.list) {
      if (d.rest) continue;
      d.v.y -= 9.81 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      const ang = d.w.length();
      if (ang > 1e-3) { ax.copy(d.w).divideScalar(ang); q.setFromAxisAngle(ax, ang * dt); d.obj.quaternion.premultiply(q); }
      const floor = d.ground + d.halfH;
      if (d.obj.position.y < floor) {
        d.obj.position.y = floor;
        if (d.v.y < -1.5) {
          // a bounce: most of the height is lost, and scraping along the
          // road takes speed and spin away
          d.v.y *= -0.32;
          d.v.x *= 0.72; d.v.z *= 0.72;
          d.w.multiplyScalar(0.6);
        } else {
          d.v.y = 0;
          const h = Math.hypot(d.v.x, d.v.z), slow = Math.max(0, h - 9 * dt);
          const k = h > 1e-4 ? slow / h : 0;
          d.v.x *= k; d.v.z *= k;
          d.w.multiplyScalar(Math.exp(-dt * 5));
          // settle flat-ish when it has nearly stopped
          if (h < 0.3 && ang < 0.4) d.rest = true;
        }
      }
    }
  }

  clear() {
    for (const d of this.list) this.scene.remove(d.obj);
    this.list = [];
  }
}
