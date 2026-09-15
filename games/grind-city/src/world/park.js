// A park is one continuous ground polyline plus a set of rails floating above it.
//
// Why a polyline and not a heightfield: a skatepark has near-vertical
// transitions, and a heightfield cannot express one. Riding is done in ARC
// LENGTH along the polyline (`s`) with a signed speed, which is how real
// transition skating works -- gravity pulls you along the tangent, you pump for
// energy, and you leave the surface at a lip with your tangent velocity.
//
// Rails are deliberately NOT part of the ground. They always sit clear above it,
// so "am I on a rail" is never ambiguous with "am I on the floor": you have to
// get airborne to reach one.

const RAD = Math.PI / 180;

// HOW BIG A PARK IS. Every park is authored at its old size and blown up by
// this on the way out, so the numbers in parks.js still read as the sizes a
// person would draw -- a six stair is six steps of 14, not of 24.5.
//
// Scaling the world alone would make it unplayable: the same pop would clear
// a proportionally smaller gap, and the same top speed would take half again
// as long to cross a block. Under dynamic similarity, if lengths go up by S
// and gravity stays put, then times and SPEEDS go up by sqrt(S) while
// accelerations do not move at all. SPEED is that square root, and it is what
// the pop, the speed cap and the walking pace are multiplied by; pushing,
// braking, pumping and gravity are accelerations and stay exactly as they
// were. That keeps every jump clearing the same features it used to.
export const WORLD = 1.75;
export const SPEED = Math.sqrt(WORLD);

export class Builder {
  constructor(x, y, mat = 'con') {
    this.pts = [[x, y]];
    this.mats = [];
    this.lips = [];        // index of a vertex you can fly off
    this.rails = [];
    this.decor = [];
    this.mat = mat;
  }
  get x() { return this.pts[this.pts.length - 1][0]; }
  get y() { return this.pts[this.pts.length - 1][1]; }

  to(x, y, mat) {
    this.pts.push([x, y]);
    this.mats.push(mat || this.mat);
    return this;
  }
  lip() { this.lips.push(this.pts.length - 1); return this; }

  flat(len, mat) { return this.to(this.x + len, this.y, mat); }
  slope(len, dy, mat) { return this.to(this.x + len, this.y + dy, mat); }

  // Smooth bank: a shallow arc rather than a hard corner, so the skater does
  // not get flung off a crease.
  bank(len, dy, mat, steps = 6) {
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t * t * (3 - 2 * t);   // smoothstep
      this.to(x0 + len * t, y0 + dy * e, mat);
    }
    return this;
  }

  // Transition curving UP to the right: flat -> wall. Ends at the lip.
  // Capped below 90 degrees on purpose; a truly vertical segment has zero
  // x-extent and every ray test against it becomes a special case.
  transUp(R, deg = 84, mat, steps = 10) {
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= steps; i++) {
      const a = deg * RAD * (i / steps);
      this.to(x0 + R * Math.sin(a), y0 - R * (1 - Math.cos(a)), mat);
    }
    return this;
  }

  // Transition curving DOWN from a wall on the left into flat: deck -> floor.
  transDown(R, deg = 84, mat, steps = 10) {
    const x0 = this.x, y0 = this.y;
    const a0 = (90 - deg) * RAD;
    for (let i = 1; i <= steps; i++) {
      const a = a0 + (90 * RAD - a0) * (i / steps);
      this.to(x0 + R * (Math.cos(a0) - Math.cos(a)), y0 + R * (Math.sin(a) - Math.sin(a0)), mat);
    }
    return this;
  }

  // Launch ramp: up the face, then a steep back you drop off.
  kicker(len, h, mat) {
    this.bank(len, -h, mat, 5).lip();
    return this.to(this.x + 3, this.y + h, mat);
  }

  stairs(n, run, rise, mat) {
    for (let i = 0; i < n; i++) { this.to(this.x + 2, this.y + rise, mat); this.to(this.x + run, this.y, mat); }
    return this;
  }

  // A pit you have to clear. You drop in over a hard edge -- that is the gap --
  // but the FAR side is a rideable bank, not a wall. A wall you cannot push up
  // is not a gap, it is a place the run ends.
  pit(len, depth, mat) {
    this.lip();
    this.to(this.x + 5, this.y + depth, mat);
    this.flat(len, mat);
    this.bank(Math.max(40, depth * 2.4), -depth, mat, 5);
    return this;
  }

  // Raised block (funbox / manny pad) built into the floor.
  block(len, h, ramp, mat) {
    this.bank(ramp, -h, mat, 4).lip();
    this.flat(len, mat).lip();
    return this.bank(ramp, h, mat, 4);
  }

  rail(x0, y0, x1, y1, kind = 'rail') { this.rails.push({ x0, y0, x1, y1, kind }); return this; }
  flatbar(x, y, len, h) { return this.rail(x, y - h, x + len, y - h, 'rail'); }
  ledge(x, y, len, h) { return this.rail(x, y - h, x + len, y - h, 'ledge'); }
  // A grind line that is already held up by something -- the roof edge of a
  // subway car, the top of a wall. Ordinary rails drop legs to the floor and
  // ordinary ledges pour a concrete block under themselves; both of those go
  // straight through whatever is actually carrying the edge.
  bar(x, y, len, h, kind = 'ledge') {
    this.rail(x, y - h, x + len, y - h, kind);
    this.rails[this.rails.length - 1].bare = true;
    return this;
  }
  put(kind, x, y, o = {}) { this.decor.push(Object.assign({ kind, x, y }, o)); return this; }
}

export function buildPark(def) {
  const b = new Builder(def.start ? def.start[0] : 0, def.start ? def.start[1] : 150, def.mat || 'con');
  def.build(b);

  // Blow the whole thing up. Everything below -- arc lengths, buckets, the
  // bounding box, the spawn point -- is derived from these, so scaling here
  // is the only place it has to happen.
  for (const p of b.pts) { p[0] *= WORLD; p[1] *= WORLD; }
  for (const r of b.rails) {
    r.x0 *= WORLD; r.y0 *= WORLD; r.x1 *= WORLD; r.y1 *= WORLD;
  }
  for (const d of b.decor) {
    d.x *= WORLD; d.y *= WORLD;
    for (const k of ['w', 'h', 'deep', 'r', 'len']) {
      if (typeof d[k] === 'number') d[k] *= WORLD;
    }
  }

  const pts = b.pts;
  const segs = [];
  const cum = [0];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 0.0001;
    const tx = dx / len, ty = dy / len;
    segs.push({
      i, x0, y0, x1, y1, dx, dy, len, tx, ty,
      nx: ty, ny: -tx,                       // surface normal, pointing "up" out of the floor
      mat: b.mats[i] || b.mat,
      lipEnd: b.lips.includes(i + 1),
      s0: total,
    });
    total += len;
    cum.push(total);
  }

  // Bucket segments by x so ray tests do not scan the whole park.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const BK = 32;
  const buckets = new Map();
  for (const s of segs) {
    const a = Math.floor(Math.min(s.x0, s.x1) / BK), z = Math.floor(Math.max(s.x0, s.x1) / BK);
    for (let k = a; k <= z; k++) {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    }
  }

  // COLLECTIBLES are pulled out of the decor list. Decor is immutable scenery
  // that every park shares; a collectible has state -- it goes away when you
  // take it -- so it cannot live in there.
  const coins = [];
  b.decor = b.decor.filter((d) => {
    if (d.kind !== 'coin') return true;
    coins.push({ x: d.x, y: d.y, seed: d.seed || 0, taken: false });
    return false;
  });

  const rails = b.rails.map((r, i) => {
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0;
    const len = Math.hypot(dx, dy) || 0.0001;
    return Object.assign({}, r, { i, dx, dy, len, tx: dx / len, ty: dy / len });
  });

  const park = {
    name: def.name, sub: def.sub, theme: def.theme, tint: def.tint,
    pts, segs, cum, total, rails, decor: b.decor, coins,
    minX, maxX, minY, maxY,
    spawnS: 0,

    segAt(s) {
      s = Math.max(0, Math.min(total - 0.001, s));
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
      return segs[lo];
    },

    posAt(s) {
      const g = park.segAt(s);
      const t = (s - g.s0) / g.len;
      return { x: g.x0 + g.dx * t, y: g.y0 + g.dy * t, seg: g, t };
    },

    // Ground height directly under a world x. Used for shadows and for dropping
    // decor onto the floor -- never for physics.
    groundY(x) {
      const list = buckets.get(Math.floor(x / BK));
      let best = null;
      if (list) for (const s of list) {
        const lo = Math.min(s.x0, s.x1), hi = Math.max(s.x0, s.x1);
        if (x < lo - 0.001 || x > hi + 0.001) continue;
        const t = Math.abs(s.dx) < 0.001 ? 0 : (x - s.x0) / s.dx;
        const y = s.y0 + s.dy * t;
        if (best === null || y < best) best = y;
      }
      return best === null ? maxY + 40 : best;
    },

    // Sweep a moving point against the floor. Returns the FIRST crossing.
    hitGround(x0, y0, x1, y1) {
      const a = Math.floor(Math.min(x0, x1) / BK) - 1, z = Math.floor(Math.max(x0, x1) / BK) + 1;
      let best = null;
      const seen = new Set();
      for (let k = a; k <= z; k++) {
        const list = buckets.get(k);
        if (!list) continue;
        for (const s of list) {
          if (seen.has(s.i)) continue;
          seen.add(s.i);
          const h = segHit(x0, y0, x1, y1, s.x0, s.y0, s.x1, s.y1);
          if (h && (!best || h.u < best.u)) best = { u: h.u, x: h.x, y: h.y, seg: s, s: s.s0 + h.v * s.len };
        }
      }
      return best;
    },

    hitRail(x0, y0, x1, y1) {
      let best = null;
      for (const r of rails) {
        if (Math.max(x0, x1) < Math.min(r.x0, r.x1) - 2) continue;
        if (Math.min(x0, x1) > Math.max(r.x0, r.x1) + 2) continue;
        const h = segHit(x0, y0, x1, y1, r.x0, r.y0, r.x1, r.y1);
        if (h && (!best || h.u < best.u)) best = { u: h.u, x: h.x, y: h.y, rail: r, v: h.v };
      }
      return best;
    },

    // Push a point that has ended up under the floor back onto it.
    depth(x, y) { return y - park.groundY(x); },
  };

  if (def.spawn != null) {
    // spawn is given as a world x; convert to arc length.
    let bestI = 0, bestD = 1e9;
    for (const s of segs) {
      const d = Math.abs((s.x0 + s.x1) / 2 - def.spawn * WORLD);
      if (d < bestD) { bestD = d; bestI = s.i; }
    }
    park.spawnS = segs[bestI].s0 + segs[bestI].len / 2;
  }
  return park;
}

// Segment/segment intersection. u = along the motion, v = along the surface.
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1 = bx - ax, r2 = by - ay;
  const s1 = dx - cx, s2 = dy - cy;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const u = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const v = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v, x: ax + r1 * u, y: ay + r2 * u };
}
