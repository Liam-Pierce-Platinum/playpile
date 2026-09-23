// =====================================================================
// NASCAR :: damage.js - THE SHEET METAL
// =====================================================================
//
// Liam asked for "soft body physics that are realistic", and for a stock
// car that is not a garnish - it is half of what the sport looks like. A
// Cup car finishes a superspeedway race with the right side rubbed
// smooth, the nose pushed back, a fender folded onto a tyre and tape
// holding the front bumper on. Nothing about that is a texture swap.
//
// APEX's damage.js dents a body by pushing the nearest vertices in along
// their normals, once, per impact. That is a good trick and it is the
// wrong model for this, for three reasons:
//
//   1. IT DOES NOT ACCUMULATE PROPERLY. Every dent is independent, so a
//      quarter panel that grinds along the wall for a hundred metres gets
//      sixty unrelated pockmarks rather than one long crushed flank.
//   2. IT HAS NO DYNAMICS. Real panels spring back some of the way. The
//      difference between a panel that took a knock and a panel that is
//      permanently folded in is the difference between rubbing and
//      being wrecked, and the car should know which it is.
//   3. IT DOES NOT SPREAD. Push the middle of a door in and the whole
//      door moves, because it is one piece of steel.
//
// So the bodywork is a set of PANELS, and each panel is a small lattice
// of nodes that behave like sheet metal:
//
//      a = -k(d - p) - c*v + kN * (neighbours - d)
//
//   d  how far this bit of the panel is pushed in, metres
//   p  its PLASTIC SET: the part that is never coming back. It creeps
//      toward d whenever the elastic stretch (d - p) passes the yield,
//      which is what makes a dent a dent.
//   kN the coupling to its neighbours, which is why the metal moves as a
//      sheet and not as a field of independent pins.
//
// Everything the damage COSTS is then read off the plastic set: a crushed
// nose is front downforce and drag, a folded spoiler is rear downforce, a
// fender pushed far enough in is touching a tyre and grinding it away.
// None of it is a health bar, and a pit stop only puts some of it right -
// the crew will pull a fender off a tyre and tape a nose back on, but the
// car is never straight again.
//
// This file has no three.js in it: it is the deformation FIELD. body.js
// reads the same node displacements and moves the real mesh vertices, and
// tools/crash.mjs measures the handling before and after with no browser.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// wheel order as stock.js: 0 right front, 1 left front, 2 right rear, 3 left rear
const WHEEL_AT = [[1.42, -0.86], [1.42, 0.86], [-1.37, -0.86], [-1.37, 0.86]];
export const WHEEL_NAME = ['RIGHT FRONT', 'LEFT FRONT', 'RIGHT REAR', 'LEFT REAR'];

/**
 * THE PANELS.
 *
 * Each is a flat rectangle on the car, described in the SAME space the
 * body geometry uses: +Z forward, +X left, +Y up, wheel centres at y = 0.
 * `u` and `v` are its two in-plane axes and `n` is the outward normal, so
 * a node's world offset is  origin + u*su + v*sv  and it deforms along -n.
 *
 *   aeroF/aeroR   how much of each end's downforce this panel is worth
 *   drag          how much extra drag a fully crushed one makes
 *   rubs          the wheel this panel can be folded onto, if any
 *   crush         how far it can be pushed in before it is against the
 *                 roll cage and stops
 *   tearAt        crushed past this and the panel leaves the car
 */
export const PANELS = [
  // ---- the front ------------------------------------------------------
  { id: 'nose',    origin: [0, 0.22, 2.44], u: [1, 0, 0], v: [0, 1, 0], su: 0.92, sv: 0.28,
    n: [0, 0, 1], nu: 7, nv: 3, crush: 0.55, tearAt: 0.42, aeroF: 0.45, drag: 0.10, name: 'NOSE' },
  { id: 'splitter', origin: [0, -0.30, 2.50], u: [1, 0, 0], v: [0, 0, -1], su: 0.95, sv: 0.16,
    n: [0, 0.4, 0.92], nu: 5, nv: 2, crush: 0.22, tearAt: 0.15, aeroF: 0.55, drag: 0.05, name: 'SPLITTER' },
  { id: 'hood',    origin: [0, 0.46, 1.68], u: [1, 0, 0], v: [0, 0, 1], su: 0.84, sv: 0.62,
    n: [0, 1, 0.08], nu: 5, nv: 4, crush: 0.30, tearAt: 0.24, aeroF: 0.10, drag: 0.10, name: 'HOOD' },
  // ---- the sides, right then left -------------------------------------
  { id: 'rfFender', origin: [-0.96, 0.26, 1.62], u: [0, 0, 1], v: [0, 1, 0], su: 0.62, sv: 0.32,
    n: [-1, 0.06, 0], nu: 5, nv: 3, crush: 0.46, tearAt: 99, drag: 0.09, rubs: 0, name: 'RIGHT FRONT FENDER' },
  { id: 'lfFender', origin: [0.96, 0.26, 1.62], u: [0, 0, 1], v: [0, 1, 0], su: 0.62, sv: 0.32,
    n: [1, 0.06, 0], nu: 5, nv: 3, crush: 0.46, tearAt: 99, drag: 0.09, rubs: 1, name: 'LEFT FRONT FENDER' },
  { id: 'rDoor',   origin: [-0.97, 0.26, 0.20], u: [0, 0, 1], v: [0, 1, 0], su: 0.78, sv: 0.34,
    n: [-1, 0, 0], nu: 6, nv: 3, crush: 0.40, tearAt: 99, drag: 0.07, name: 'RIGHT DOOR' },
  { id: 'lDoor',   origin: [0.97, 0.26, 0.20], u: [0, 0, 1], v: [0, 1, 0], su: 0.78, sv: 0.34,
    n: [1, 0, 0], nu: 6, nv: 3, crush: 0.40, tearAt: 99, drag: 0.07, name: 'LEFT DOOR' },
  { id: 'rQuarter', origin: [-0.96, 0.26, -1.42], u: [0, 0, 1], v: [0, 1, 0], su: 0.72, sv: 0.33,
    n: [-1, 0.06, 0], nu: 5, nv: 3, crush: 0.46, tearAt: 99, drag: 0.09, rubs: 2, name: 'RIGHT QUARTER' },
  { id: 'lQuarter', origin: [0.96, 0.26, -1.42], u: [0, 0, 1], v: [0, 1, 0], su: 0.72, sv: 0.33,
    n: [1, 0.06, 0], nu: 5, nv: 3, crush: 0.46, tearAt: 99, drag: 0.09, rubs: 3, name: 'LEFT QUARTER' },
  // ---- the top and the back -------------------------------------------
  { id: 'roof',    origin: [0, 1.02, 0.10], u: [1, 0, 0], v: [0, 0, 1], su: 0.68, sv: 0.78,
    n: [0, 1, 0], nu: 5, nv: 4, crush: 0.26, tearAt: 99, drag: 0.06, name: 'ROOF' },
  { id: 'deck',    origin: [0, 0.52, -1.62], u: [1, 0, 0], v: [0, 0, 1], su: 0.82, sv: 0.62,
    n: [0, 1, -0.10], nu: 5, nv: 3, crush: 0.28, tearAt: 0.24, aeroR: 0.15, drag: 0.06, name: 'DECK LID' },
  { id: 'spoiler', origin: [0, 0.78, -2.28], u: [1, 0, 0], v: [0, 1, 0], su: 0.82, sv: 0.16,
    n: [0, 0.15, -0.99], nu: 5, nv: 2, crush: 0.30, tearAt: 0.20, aeroR: 0.80, drag: -0.10, name: 'SPOILER' },
  { id: 'tail',    origin: [0, 0.24, -2.46], u: [1, 0, 0], v: [0, 1, 0], su: 0.92, sv: 0.28,
    n: [0, 0, -1], nu: 7, nv: 3, crush: 0.50, tearAt: 0.40, aeroR: 0.05, drag: 0.08, name: 'REAR BUMPER' },
];

// how the metal behaves
const SHEET = {
  k:       900,     // N/m per node of elastic stiffness, over its own mass
  c:       26,      // damping
  kN:      520,     // how hard a node drags its neighbours along
  yield:   0.018,   // m of elastic stretch before it takes a set
  creep:   9.0,     // how fast the set follows, per second past the yield
  nodeM:   1.0,     // everything above is already per unit mass
};

/** a panel's own working state */
function makePanel(spec) {
  const n = spec.nu * spec.nv;
  return {
    spec,
    d: new Float32Array(n),      // how far in, now
    v: new Float32Array(n),      // and how fast
    p: new Float32Array(n),      // the part that is never coming back
    gone: false,
    worst: 0,                    // deepest permanent set, metres
    mean: 0,
    live: false,                 // is anything on it still moving
  };
}

/** a node's position on the car, in body space [fwd, left, up] */
export function nodeAt(spec, i, j) {
  const a = spec.nu > 1 ? (i / (spec.nu - 1)) * 2 - 1 : 0;
  const b = spec.nv > 1 ? (j / (spec.nv - 1)) * 2 - 1 : 0;
  const x = spec.origin[0] + spec.u[0] * a * spec.su + spec.v[0] * b * spec.sv;
  const y = spec.origin[1] + spec.u[1] * a * spec.su + spec.v[1] * b * spec.sv;
  const z = spec.origin[2] + spec.u[2] * a * spec.su + spec.v[2] * b * spec.sv;
  return [z, x, y];              // [forward, left, up] - the order impacts arrive in
}

export class Damage {
  constructor(runner) {
    this.r = runner;
    this.panels = PANELS.map(makePanel);
    this.byId = {};
    for (const p of this.panels) this.byId[p.spec.id] = p;
    this.reset();
  }

  reset() {
    for (const p of this.panels) {
      p.d.fill(0); p.v.fill(0); p.p.fill(0);
      p.gone = false; p.worst = 0; p.mean = 0; p.live = false;
    }
    this.tyre = ['ok', 'ok', 'ok', 'ok'];
    this.hp = [1, 1, 1, 1];
    this.flatRun = [0, 0, 0, 0];
    this.scratch = 0;             // how scuffed the paint is, 0..1
    this.hits = 0;
    this.worstHit = 0;
    this.messages = [];
    this.dirty = true;            // body.js needs to redraw the mesh
    this.apply();
  }

  /** what is wrong with it, in short words */
  get summary() {
    const s = [];
    for (const p of this.panels) {
      if (p.gone) s.push(p.spec.name.toLowerCase() + ' gone');
      else if (p.worst > 0.13) s.push(p.spec.name.toLowerCase() + ' crushed');
    }
    this.tyre.forEach((t, k) => { if (t !== 'ok') s.push(WHEEL_NAME[k].toLowerCase() + ' ' + (t === 'off' ? 'wheel' : t)); });
    return s;
  }

  /** how bent the car is overall, 0..1 - the one number for the HUD */
  get severity() {
    let s = 0;
    for (const p of this.panels) s += (p.gone ? 1 : clamp(p.worst / p.spec.crush, 0, 1)) * (p.spec.drag > 0 ? 1 : 0.6);
    return clamp(s / this.panels.length * 2.2, 0, 1);
  }

  get needsPit() {
    return this.tyre.some((t) => t !== 'ok') || this.severity > 0.22
      || this.panels.some((p) => p.spec.rubs !== undefined && p.worst > 0.24);
  }

  /** a wheel off, or the nose completely gone: the car is finished */
  get terminal() {
    return this.tyre.some((t) => t === 'off') || this.severity > 0.72;
  }

  /**
   * Write what is bent into the numbers stock.js drives with.
   *
   * There is no table of consequences anywhere: each panel declares what
   * share of the car's downforce and drag it is responsible for, and this
   * adds up how much of each is still attached.
   */
  apply() {
    const d = this.r.car.dmg;
    let aF = 0, aR = 0, drag = 0, pull = 0;
    for (const p of this.panels) {
      const S = p.spec;
      // a panel that has left the car is a total loss of whatever it did
      const lost = p.gone ? 1 : clamp(p.worst / S.crush, 0, 1);
      if (S.aeroF) aF += S.aeroF * lost;
      if (S.aeroR) aR += S.aeroR * lost;
      drag += (S.drag || 0) * lost;
      // a nose crushed ON ONE SIDE pulls the car that way: the mean set on
      // the left half of the nose against the right half
      if (S.id === 'nose') {
        let L = 0, R = 0;
        for (let j = 0; j < S.nv; j++) {
          for (let i = 0; i < S.nu; i++) {
            const val = p.p[j * S.nu + i];
            if (i < S.nu / 2 - 0.5) R += val; else if (i > S.nu / 2 - 0.5) L += val;
          }
        }
        pull += (L - R) * 0.010;
      }
    }
    d.aeroF = clamp(1 - aF, 0.15, 1);
    d.aeroR = clamp(1 - aR, 0.15, 1);
    d.drag = clamp(drag * 0.9, -0.08, 0.55);

    // ---- A FENDER FOLDED ONTO A TYRE ------------------------------------
    // The one piece of damage that ends races. A crushed fender is 46 cm of
    // travel before the roll cage stops it, and the tyre is about 30 cm in:
    // past that the metal is ON the rubber, and rubber against sheet metal
    // at 190 mph does not last long. `rub` goes to stock.js, which wears
    // that tyre out many times faster than the road does.
    for (let k = 0; k < 4; k++) d.rub[k] = 0;
    for (const p of this.panels) {
      const S = p.spec;
      if (S.rubs === undefined) continue;
      const over = (p.gone ? S.crush : p.worst) - 0.28;
      if (over > 0) d.rub[S.rubs] = clamp(over * 3.0, 0, 1);
    }

    for (let k = 0; k < 4; k++) {
      const t = this.tyre[k];
      d.grip[k] = t === 'ok' ? 1 : t === 'flat' ? 0.32 : t === 'rim' ? 0.15 : 0;
      d.scrape[k] = t === 'ok' ? 0 : t === 'flat' ? 0.07 : t === 'rim' ? 0.40 : 0.95;
    }
    d.pull = clamp(pull, -0.035, 0.035);
  }

  /**
   * The crew, on a stop. They can put tyres on it, pull the fenders off the
   * wheels and tape the nose back together; what they cannot do is make it
   * straight. So the PLASTIC SET is reduced, not cleared - which is why a
   * car that has been in something is never the same car again, and why a
   * race full of contact ends with a field of slow cars.
   */
  mend(full = false) {
    for (const p of this.panels) {
      if (p.gone && !full) continue;                 // they cannot fetch it back
      const keep = full ? 0 : 0.45;
      for (let i = 0; i < p.p.length; i++) { p.p[i] *= keep; p.d[i] *= keep; p.v[i] = 0; }
      if (full) p.gone = false;
      this.measure(p);
    }
    this.tyre = ['ok', 'ok', 'ok', 'ok'];
    this.hp = [1, 1, 1, 1];
    this.flatRun = [0, 0, 0, 0];
    if (full) { this.scratch = 0; this.hits = 0; }
    this.dirty = true;
    this.apply();
  }

  /** recompute a panel's headline numbers after its nodes have moved */
  measure(p) {
    let worst = 0, sum = 0;
    for (let i = 0; i < p.p.length; i++) { if (p.p[i] > worst) worst = p.p[i]; sum += p.p[i]; }
    p.worst = worst;
    p.mean = sum / p.p.length;
  }

  /**
   * ONE CONTACT, from world.js: where on the car (metres forward and left
   * of the centre of mass), how hard into it (`vn`) and how hard along it
   * (`vt`).
   *
   * Returns what happened, for the effects:
   *   { sparks, scuff, crushed: [panel ids], torn: [ids], flat: k|-1, wheelOff: k|-1 }
   */
  impact(imp) {
    const out = { sparks: 0, scuff: 0, crushed: [], torn: [], flat: -1, wheelOff: -1 };
    // two cars that touch SHARE the blow; a car into a wall takes all of it
    const hard = imp.other ? imp.vn * 0.55 : imp.vn;
    const slide = imp.vt;
    if (hard < 0.25 && slide < 2.5) return out;

    // ---- sparks and scuffed paint ---------------------------------------
    out.sparks = imp.other ? hard * 3.5 + slide * 0.55 : hard * 5 + slide * 0.40;
    if (out.sparks < 2) out.sparks = 0;
    out.scuff = clamp(hard * 0.04 + slide * 0.008, 0, 1);
    if (out.scuff > 0.01) { this.scratch = clamp(this.scratch + out.scuff * 0.05, 0, 1); this.dirty = true; }

    if (hard > 1.2) { this.hits++; this.worstHit = Math.max(this.worstHit, hard); }

    // ---- WHICH PANELS TOOK IT -------------------------------------------
    //
    // Not "the nearest one": a hit on the right front corner at an angle
    // loads the nose AND the right front fender, which is why that corner
    // of a Cup car ends up looking the way it does. So every panel whose
    // outward normal faces into the blow gets a share, weighted by how
    // square it is to the direction of the hit and how near the contact is.
    const ix = imp.fwd, iy = imp.left, iz = (imp.up === undefined ? 0.30 : imp.up);
    // the direction of the blow, in body space: outward from the car's
    // centre toward the contact point is a good enough proxy for a wall,
    // and for car-to-car world.js already gives the contact point
    const mag = Math.max(0.3, Math.hypot(ix * 0.5, iy, iz - 0.3));
    const bx = (ix * 0.5) / mag, by = iy / mag, bz = (iz - 0.3) / mag;

    // the energy to be shared out. A stock car's front and rear bumpers are
    // crush structures and its doors are not, which the panels' own `crush`
    // already says; this is just how deep the blow reaches.
    const depth = Math.max(0, hard - 1.0) * 0.022 + Math.max(0, slide - 4) * 0.0012;
    const kick = Math.max(0, hard - 1.0) * 0.55;
    if (depth <= 0 && kick <= 0) return out;

    for (const p of this.panels) {
      if (p.gone) continue;
      const S = p.spec;
      // facing into the blow? (the panel's normal points OUT of the car)
      const face = S.n[2] * bx + S.n[0] * by + S.n[1] * bz;      // n is [x,y,z] = [left,up,fwd]
      if (face < 0.18) continue;
      let touched = false;
      for (let j = 0; j < S.nv; j++) {
        for (let i = 0; i < S.nu; i++) {
          const [nf, nl, nu2] = nodeAt(S, i, j);
          const dd = Math.hypot(nf - ix, nl - iy, (nu2 - iz) * 0.8);
          // how far the blow reaches along the metal: a big hit spreads
          const reach = 0.42 + depth * 4.5;
          if (dd > reach) continue;
          const w = (1 - dd / reach) ** 1.4 * face;
          const n = j * S.nu + i;
          p.d[n] = Math.min(S.crush, p.d[n] + depth * w);
          p.v[n] += kick * w;
          touched = true;
        }
      }
      if (touched) {
        p.live = true;
        this.dirty = true;
        const before = p.worst;
        // the set follows immediately for the part that is already past the
        // crush limit - metal against the cage does not spring back at all
        this.settle(p, 1 / 60);
        if (p.worst > 0.10 && before <= 0.10) {
          out.crushed.push(S.id);
          this.messages.push(S.name + ' DAMAGE');
        }
        if (p.worst > S.tearAt) {
          p.gone = true;
          out.torn.push(S.id);
          this.messages.push(S.name + ' GONE');
        }
      }
    }

    // ---- THE WHEELS ------------------------------------------------------
    for (let k = 0; k < 4; k++) {
      const [wf, wl] = WHEEL_AT[k];
      if (Math.hypot(imp.fwd - wf, (imp.left - wl) * 0.75) > 0.95) continue;
      if (this.tyre[k] === 'off') continue;
      // HITS puncture, scraping does not: contact is reported every frame it
      // lasts, and charging per frame for a scrape gave a flat after ten
      // frames of brushing the wall - a whole field of flats on lap one.
      this.hp[k] -= Math.max(0, hard - 2.2) * 0.085;
      if (hard > 19) {
        this.tyre[k] = 'off'; out.wheelOff = k;
        this.messages.push('LOST THE ' + WHEEL_NAME[k] + ' WHEEL');
      } else if (this.tyre[k] === 'ok' && this.hp[k] < 0.5) {
        this.tyre[k] = 'flat'; out.flat = k;
        this.messages.push(WHEEL_NAME[k] + ' TYRE DOWN');
      }
    }

    this.apply();
    return out;
  }

  /**
   * THE SHEET METAL, SETTLING.
   *
   * Run every frame for every panel that is still moving. This is the
   * "soft body" half of the brief and it is four lines of arithmetic per
   * node: a spring back toward the permanent set, a damper, a pull toward
   * the neighbours, and the set creeping outward whenever the elastic
   * stretch is past the yield.
   *
   * The result is what sheet metal does. A glancing blow rings the panel
   * and it comes most of the way back. A hard one takes a set and the
   * panel stays there. And a panel that is already bent takes the next
   * blow from where it is, which is why the right side of a car in a
   * superspeedway race gets worse and worse over a hundred laps rather
   * than resetting between contacts.
   */
  settle(p, dt) {
    const S = p.spec;
    const nu = S.nu, nv = S.nv;
    let moving = false;
    // sub-stepped: kN + k over a node of unit mass is a stiff little
    // oscillator and it will not integrate at 60 Hz
    const sub = 4, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const n = j * nu + i;
          // the neighbours' average, which is what makes it a sheet
          let acc = 0, cnt = 0;
          if (i > 0) { acc += p.d[n - 1]; cnt++; }
          if (i < nu - 1) { acc += p.d[n + 1]; cnt++; }
          if (j > 0) { acc += p.d[n - nu]; cnt++; }
          if (j < nv - 1) { acc += p.d[n + nu]; cnt++; }
          const nb = cnt ? acc / cnt : p.d[n];
          const e = p.d[n] - p.p[n];
          const a = -SHEET.k * e - SHEET.c * p.v[n] + SHEET.kN * (nb - p.d[n]);
          p.v[n] += a * h;
          p.d[n] = clamp(p.d[n] + p.v[n] * h, -0.02, S.crush);
          // and the permanent set creeps out to meet it
          const over = Math.abs(e) - SHEET.yield;
          if (over > 0 && e > 0) p.p[n] = Math.min(S.crush, p.p[n] + over * SHEET.creep * h);
          if (Math.abs(p.v[n]) > 0.02 || Math.abs(e) > 0.004) moving = true;
        }
      }
    }
    p.live = moving;
    this.measure(p);
  }

  /**
   * Every frame. Settles whatever is still ringing, and looks after the
   * tyres: a flat run far enough shreds to the rim, and a tyre being
   * ground away by a fender lets go on its own.
   */
  step(dt) {
    const car = this.r.car;
    let changed = false;
    for (const p of this.panels) {
      if (!p.live || p.gone) continue;
      this.settle(p, dt);
      changed = true;
    }
    if (changed) { this.dirty = true; this.apply(); }

    let shred = -1;
    for (let k = 0; k < 4; k++) {
      if (this.tyre[k] === 'flat') {
        this.flatRun[k] += car.speed * dt;
        if (this.flatRun[k] > 700) { this.tyre[k] = 'rim'; shred = k; this.apply(); }
      } else if (this.tyre[k] === 'ok' && car.wheels[k].wear <= 0.02 && car.speed > 20 && Math.random() < dt * 0.5) {
        this.tyre[k] = 'flat';
        this.messages.push(WHEEL_NAME[k] + ' TYRE DOWN - WORN THROUGH');
        this.apply();
      }
    }
    return shred;
  }
}
