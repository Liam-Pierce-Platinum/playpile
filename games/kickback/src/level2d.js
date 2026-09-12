/* =====================================================================
   level2d.js — the tower, flat
   =====================================================================
   Six floors of an unfinished concrete frame, seen square on. There is no
   depth: the building is a section drawing you can walk around inside,
   which is what a side-scroller is, and pretending otherwise was the
   mistake in the last one.

   The back wall is MOSTLY HOLE, and that is the point of the whole
   composition: the only bright thing anywhere is the harbour, so every
   figure, column and barrel in the place is read as a dark shape against
   it. The piers between the openings carry the graffiti; the slabs and
   columns carry the rust and the rebar.
   ===================================================================== */
import { P, rect, px, poly, toScreenX, toScreenY, PPM, W, H, hash, rng, gfx } from './pix.js';

export const L = {
  span: 44, storey: 4.2, floors: 6,
  slab: 0.4,
  bayW: 4.4,            // one structural bay
};
export const HX = L.span / 2;
export const TOP = L.storey * L.floors;

/* A box can stop a bullet without stopping a person. In three dimensions
   you walk round a column; in two there is no round, so a full-height
   column that blocked movement would wall the floor off completely - and
   that is exactly what it did, with the stair on the far side of it.
   Columns and drums are : you brush past them, and they still
   eat everything fired at you. Which is what taking cover behind a pillar
   in a side-scroller has always meant. */
/* A box can stop a bullet without stopping a person. In three dimensions
   a column is walked round; in two there is no round, so a full-height
   column that blocked movement walled the floor off completely - and it
   did, with the stair on the far side of it. Columns and drums are
   marked noWalk: you brush past them, and they still eat everything
   fired at you, which is what taking cover behind a pillar in a
   side-scroller has always meant. */
export function aabb(x0, y0, x1, y1, kind, noWalk) {
  return { x0, y0, x1, y1, kind: kind || 'solid', noWalk: !!noWalk };
}

/* the stair for floor f runs to the right on even floors, left on odd */
export function stairSide(f) { return f % 2 === 0 ? 1 : -1; }
export function stairSpan(f) {
  const s = stairSide(f);
  return s > 0 ? [HX - 7.2, HX - 0.6] : [-HX + 0.6, -HX + 7.2];
}

export function buildLevel() {
  const solids = [], barrels = [], props = [], spawns = [], crates = [], tags = [];

  for (let f = 0; f < L.floors; f++) {
    const y = f * L.storey;
    const [sx0, sx1] = stairSpan(f);
    const R = rng(1013 + f * 7919);

    /* --- the slab, with the stairwell from below missing out of it ------ */
    if (f === 0) {
      solids.push(aabb(-HX, y - L.slab, HX, y, 'floor'));
    } else {
      const [px0, px1] = stairSpan(f - 1);
      if (px0 > -HX) solids.push(aabb(-HX, y - L.slab, px0, y, 'floor'));
      if (px1 < HX) solids.push(aabb(px1, y - L.slab, HX, y, 'floor'));
    }
    /* the end walls */
    solids.push(aabb(-HX - 0.6, y, -HX, y + L.storey, 'wall'));
    solids.push(aabb(HX, y, HX + 0.6, y + L.storey, 'wall'));

    /* --- columns ------------------------------------------------------- */
    for (let bx = -HX + L.bayW; bx < HX - 1; bx += L.bayW) {
      if (bx > sx0 - 1.2 && bx < sx1 + 1.2) continue;
      solids.push(aabb(bx - 0.34, y, bx + 0.34, y + L.storey, 'pillar', true));
      props.push({ kind: 'column', x: bx, y, tagged: R() < 0.45, spall: R() < 0.3, f });
    }

    /* --- the stair up --------------------------------------------------- */
    if (f < L.floors - 1) {
      const dir = stairSide(f);
      const N = 15, rise = L.storey / N, going = 0.42;
      const runLen = N * going;
      const bx = dir > 0 ? sx1 - runLen : sx0;
      for (let k = 0; k < N; k++) {
        const stx = dir > 0 ? bx + k * going : bx + (N - 1 - k) * going;
        const sty = y + rise * (k + 1);
        solids.push(aabb(stx, sty - 0.12, stx + going, sty, 'floor'));
      }
      props.push({ kind: 'stair', x0: bx, x1: bx + runLen, y, dir, N, rise, going, f });
      /* the crate at the top of it: pick an upgrade before the next floor */
      crates.push({ x: dir > 0 ? sx1 - 1.2 : sx0 + 1.2, y: y + L.storey, taken: false, f });
    }

    /* --- what is lying about -------------------------------------------- */
    const clear = (x) => !(x > sx0 - 2 && x < sx1 + 2);
    for (let i = 0; i < 3; i++) {
      const bx = -HX + 3 + R() * (L.span - 6);
      if (!clear(bx)) continue;
      barrels.push({ x: bx, y, r: 0.42, alive: true, f, wob: R() * 6.28 });
      solids.push(barrels[barrels.length - 1].solid = aabb(bx - 0.36, y, bx + 0.36, y + 1.0, 'barrel', true));
    }
    for (let i = 0; i < 2; i++) {
      const bx = -HX + 5 + R() * (L.span - 10);
      if (!clear(bx)) continue;
      const w = 1.5 + R() * 0.7;
      solids.push(aabb(bx - w / 2, y, bx + w / 2, y + 0.95, 'cover'));
      props.push({ kind: 'cover', x: bx, y, w, tall: 0.95, f });
    }
    for (let i = 0; i < 2; i++) {
      const bx = -HX + 4 + R() * (L.span - 8);
      if (!clear(bx)) continue;
      props.push({ kind: R() < 0.5 ? 'rebar' : 'boards', x: bx, y, f, r: R() });
    }

    /* --- who is waiting -------------------------------------------------- */
    const n = f === 0 ? 1 : Math.min(5, 1 + Math.round(f * 0.9));
    for (let i = 0; i < n; i++) {
      let ex = -HX + 4 + R() * (L.span - 8);
      if (!clear(ex)) ex = ex > 0 ? sx0 - 3 : sx1 + 3;
      spawns.push({ x: ex, y, f, tier: f, kind: (f >= 3 && i === 0) ? 'heavy' : 'thug' });
    }
    /* the graffiti on this floor's piers, chosen once so it never crawls */
    for (let i = 0; i < 9; i++) tags.push({ f, seed: (f * 31 + i * 7) | 0 });
  }

  /* the roof */
  solids.push(aabb(-HX, TOP, HX, TOP + 0.4, 'floor'));

  return { solids, barrels, props, spawns, crates, tags };
}

/* =====================================================================
   DRAWING
   ===================================================================== */
const TAGCOLS = [P.tag1, P.tag2, P.tag3, P.tag4, P.tag5];

/* a tag: three or four hard strokes with a drop shadow and a highlight,
   drawn from a seed so it is the same tag every time you come past it */
function drawTag(g, x, y, w, h, seed) {
  const R = rng(seed * 7919 + 13);
  const col = TAGCOLS[(R() * TAGCOLS.length) | 0];
  const x0 = toScreenX(x), y0 = toScreenY(y + h);
  const x1 = toScreenX(x + w), y1 = toScreenY(y);
  const pw = x1 - x0, ph = y1 - y0;
  if (pw < 6 || ph < 8) return;
  g.save();
  /* CLIPPED TO THE SURFACE. Whatever the random numbers do below, a
     mark cannot land anywhere except on this pier. */
  g.beginPath();
  g.rect(x0, y0, pw, ph);
  g.clip();

  const bars = 3;
  const bw = Math.max(3, Math.floor(pw / (bars * 1.7)));
  const top = y0 + ph * (0.16 + R() * 0.2);
  const bot = top + ph * (0.34 + R() * 0.22);
  const lean = (R() - 0.5) * bw * 1.2;
  const put = (bx, by, bw2, bh2, c) => { g.fillStyle = c; g.fillRect(bx | 0, by | 0, bw2 | 0, bh2 | 0); };

  for (let i = 0; i < bars; i++) {
    const bx = x0 + 2 + i * ((pw - 4 - bw) / (bars - 1));
    const t = top + (R() - 0.5) * ph * 0.08;
    const b = bot + (R() - 0.5) * ph * 0.08;
    /* the keyline first, then the fill inside it, then the shine */
    put(bx - 1, t - 1, bw + 2, b - t + 2, P.ink);
    put(bx + lean * 0.3, t, bw, b - t, col);
    put(bx + lean * 0.3, t, Math.max(1, bw * 0.34), b - t, P.white);
  }
  /* the bar across, which is what turns three strokes into a word */
  const cy = top + (bot - top) * (0.45 + R() * 0.2);
  put(x0 + 1, cy - 1, pw - 2, 4, P.ink);
  put(x0 + 2, cy, pw - 4, 2, col);
  /* and a drip or two off the bottom of one of them */
  const dx = x0 + 2 + ((R() * (pw - 6)) | 0);
  put(dx, bot, 2, ph * (0.06 + R() * 0.14), col);
  g.restore();
}

/* THE BACK WALL. Piers and bands only - the openings are simply not drawn,
   so the harbour behind shows straight through them. */
export function drawBackWall(lv, camY) {
  const g = gfx();
  const SILL = 0.5, HEAD = 0.5;
  const f0 = Math.max(0, Math.floor((camY - 6) / L.storey));
  const f1 = Math.min(L.floors - 1, Math.ceil((camY + 6) / L.storey));
  let tagI = 0;
  for (let f = 0; f < L.floors; f++) {
    const y = f * L.storey;
    for (let i = 0; i < 9; i++) tagI++;
    if (f < f0 || f > f1) continue;
    /* sill and head bands run the whole way */
    rect(-HX, y, L.span, SILL, P.cret2);
    rect(-HX, y, L.span, 0.1, P.cret3);
    rect(-HX, y + L.storey - HEAD, L.span, HEAD, P.cret2);
    rect(-HX, y + L.storey - 0.12, L.span, 0.12, P.cret1);
    /* the piers between the openings */
    let k = 0;
    for (let bx = -HX; bx <= HX - 0.01; bx += L.bayW) {
      const pw = 1.1;
      rect(bx, y + SILL, pw, L.storey - SILL - HEAD, P.cret2);
      rect(bx, y + SILL, 0.16, L.storey - SILL - HEAD, P.cret3);
      rect(bx + pw - 0.12, y + SILL, 0.12, L.storey - SILL - HEAD, P.cret1);
      /* streaks down from the sill of the opening above */
      const R = rng((f * 977 + k * 131) | 0);
      for (let s = 0; s < 3; s++)
        rect(bx + 0.1 + R() * (pw - 0.2), y + SILL, 0.06, (0.4 + R() * 1.6), P.cret1);
      if (((f * 3 + k) % 3) === 0)
        drawTag(g, bx + 0.1, y + SILL + 0.3, pw - 0.2, L.storey - SILL - HEAD - 0.6, f * 31 + k * 7);
      k++;
    }
  }
}

/* the openings on a floor, as [x0, x1] pairs - the gaps between the piers */
export function openings(f) {
  const out = [];
  const PW = 1.1;
  for (let bx = -HX; bx <= HX - 0.01; bx += L.bayW) {
    const a = bx + PW, b = Math.min(HX, bx + L.bayW);
    if (b - a > 0.4) out.push([a, b]);
  }
  return out;
}

/* THE LIGHT. Drawn after the back wall and before everything standing in
   the room, so the shafts fall behind the columns and the figures - which
   is where they belong, and is also what stops it looking like a filter
   laid over the picture. */
export function drawLight(lv, camY, t) {
  const g = gfx();
  const SILL = 0.5, HEAD = 0.5;
  const f0 = Math.max(0, Math.floor((camY - 7) / L.storey));
  const f1 = Math.min(L.floors - 1, Math.ceil((camY + 7) / L.storey));
  const SKEW = 1.5;                       // how far the beam leans as it falls
  g.globalAlpha = 0.085;
  for (let f = f0; f <= f1; f++) {
    const y = f * L.storey;
    const top = y + L.storey - HEAD, bot = y;
    for (const [a, b] of openings(f)) {
      /* the beam: the opening, sheared sideways on its way down */
      const x0 = toScreenX(a), x1 = toScreenX(b);
      if (x1 < -20 || x0 > W + 20) continue;
      const yT = toScreenY(top), yB = toScreenY(bot);
      const sk = SKEW * PPM;
      g.fillStyle = P.sky6;
      g.beginPath();
      g.moveTo(x0, yT); g.lineTo(x1, yT);
      g.lineTo(x1 + sk, yB); g.lineTo(x0 + sk, yB);
      g.closePath(); g.fill();
      /* a brighter core down the middle of it */
      const q0 = x0 + (x1 - x0) * 0.28, q1 = x0 + (x1 - x0) * 0.72;
      g.beginPath();
      g.moveTo(q0, yT); g.lineTo(q1, yT);
      g.lineTo(q1 + sk, yB); g.lineTo(q0 + sk, yB);
      g.closePath(); g.fill();
    }
  }
  g.globalAlpha = 1;

  /* the pool where a beam meets the floor, and the rim it puts on the
     edges of the opening it came through */
  g.globalAlpha = 0.14;
  for (let f = f0; f <= f1; f++) {
    const y = f * L.storey;
    for (const [a, b] of openings(f)) {
      rect(a + SKEW - 0.1, y, b - a + 0.2, 0.09, P.sky6);
      rect(a - 0.06, y + 0.5, 0.06, L.storey - 1.0, P.sky5);
      rect(b, y + 0.5, 0.06, L.storey - 1.0, P.sky5);
    }
  }
  g.globalAlpha = 1;

  /* DUST. Twenty slow motes per floor, drifting up and along, only inside
     a beam. Costs nothing and it is the difference between light and a
     painted triangle. */
  for (let f = f0; f <= f1; f++) {
    const y = f * L.storey;
    const ops = openings(f);
    for (let i = 0; i < 26; i++) {
      const o = ops[i % ops.length];
      if (!o) break;
      const s = hash(f * 31 + i, 7);
      const s2 = hash(f * 31 + i, 11);
      const ph = (t * (0.09 + s * 0.12) + s2) % 1;
      const dx = o[0] + s * (o[1] - o[0]) + ph * 1.5;
      const dy = y + L.storey - 0.5 - ph * (L.storey - 0.5);
      const wob = Math.sin(t * 1.4 + s * 9) * 0.09;
      const sx = toScreenX(dx + wob), sy = toScreenY(dy);
      if (sx < 0 || sx > W) continue;
      px(sx, sy, 1, 1, s2 > 0.6 ? P.sky6 : P.sky5);
    }
  }
}

export function drawStructure(lv, camY) {
  const g = gfx();
  const f0 = Math.max(0, Math.floor((camY - 7) / L.storey));
  const f1 = Math.min(L.floors, Math.ceil((camY + 7) / L.storey));

  /* --- slabs ------------------------------------------------------------- */
  for (let f = 0; f <= L.floors; f++) {
    if (f < f0 || f > f1) continue;
    const y = f * L.storey;
    const pieces = [];
    if (f === 0 || f === L.floors) pieces.push([-HX, HX]);
    else {
      const [a, b] = stairSpan(f - 1);
      if (a > -HX) pieces.push([-HX, a]);
      if (b < HX) pieces.push([b, HX]);
    }
    for (const [x0, x1] of pieces) {
      rect(x0, y - L.slab, x1 - x0, L.slab, P.cret1);
      rect(x0, y - 0.1, x1 - x0, 0.1, P.cret3);       // the lit top edge
      rect(x0, y - L.slab, x1 - x0, 0.08, P.ink);      // the shadow line under it
      /* GRIME. A concrete floor is not one colour: there is dust drifted
         against the far wall, wet where the rain comes in the openings,
         and rubble everywhere. Deterministic, so it never crawls. */
      for (let k = 0; k < 40; k++) {
        const r1 = hash((x0 * 7 + k * 13) | 0, f * 17);
        const r2 = hash((x0 * 7 + k * 13) | 0, f * 17 + 3);
        const gx = x0 + r1 * (x1 - x0);
        if (r2 < 0.42) rect(gx, y - 0.1, 0.25 + r2 * 1.4, 0.05, P.cret2);
        else if (r2 < 0.72) rect(gx, y - 0.06, 0.08 + r2 * 0.1, 0.06, P.ink);
        else rect(gx, y - 0.09, 0.5 + r2 * 1.2, 0.04, P.slate);
      }
      /* and a puddle or two under the openings, which catch the sky */
      for (let k = 0; k < 3; k++) {
        const r1 = hash((x0 * 3 + k * 29) | 0, f * 41);
        if (r1 < 0.45) continue;
        const gx = x0 + r1 * (x1 - x0 - 2);
        rect(gx, y - 0.02, 0.9 + r1, 0.05, P.steel1);
        rect(gx + 0.15, y - 0.005, 0.5 + r1 * 0.6, 0.03, P.sea3);
      }
      /* the shuttering seams, every board width */
      for (let x = x0; x < x1; x += 1.2) rect(x, y - L.slab, 0.05, L.slab, P.ink);
      /* and the rebar poking out of a broken edge */
      if (f > 0 && f < L.floors) {
        for (const ex of [x0, x1]) {
          if (Math.abs(ex) > HX - 0.1) continue;
          for (let i = 0; i < 3; i++)
            rect(ex + (ex > 0 ? 0.02 : -0.3) + i * 0.02, y - 0.28 + i * 0.09, 0.3, 0.035, P.rust2);
        }
      }
    }
  }

  /* --- everything standing on them ---------------------------------------- */
  for (const p of lv.props) {
    if (p.f < f0 - 1 || p.f > f1 + 1) continue;
    const y = p.y;
    if (p.kind === 'column') {
      rect(p.x - 0.34, y, 0.68, L.storey - L.slab, P.cret2);
      rect(p.x - 0.34, y, 0.14, L.storey - L.slab, P.cret3);
      rect(p.x + 0.24, y, 0.10, L.storey - L.slab, P.cret1);
      rect(p.x - 0.36, y + 0.7, 0.72, 0.12, P.rust2);      // the leak line
      if (p.spall) {
        /* the cover has come off and the cage is showing */
        rect(p.x - 0.2, y + 1.5, 0.4, 1.0, P.ink);
        for (let i = 0; i < 3; i++) rect(p.x - 0.16 + i * 0.14, y + 1.5, 0.05, 1.0, P.rust3);
        for (let i = 0; i < 4; i++) rect(p.x - 0.2, y + 1.6 + i * 0.24, 0.4, 0.05, P.rust2);
      }
      if (p.tagged) drawTag(gfx(), p.x - 0.3, y + 1.0, 0.6, 1.4, p.f * 91 + (p.x | 0));
      /* starter bars out of the top */
      for (let i = 0; i < 3; i++)
        rect(p.x - 0.2 + i * 0.17, y + L.storey - L.slab, 0.05, 0.3, P.rust2);
    } else if (p.kind === 'cover') {
      rect(p.x - p.w / 2, y, p.w, p.tall, P.rust1);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++)
          rect(p.x - p.w / 2 + 0.06 + c * (p.w - 0.12) / 5 + (r % 2) * 0.1,
            y + 0.06 + r * (p.tall - 0.12) / 4, (p.w - 0.12) / 5 - 0.06, (p.tall - 0.12) / 4 - 0.06,
            r % 2 ? P.rust2 : P.rust3);
    } else if (p.kind === 'rebar') {
      for (let i = 0; i < 6; i++)
        rect(p.x - 1.3 + (i % 2) * 0.08, y + 0.03 + i * 0.055, 2.6, 0.05, i % 2 ? P.rust2 : P.rust3);
    } else if (p.kind === 'boards') {
      for (let i = 0; i < 4; i++)
        rect(p.x - 1.1, y + 0.02 + i * 0.09, 2.2, 0.08, i % 2 ? P.rust2 : P.rust1);
    } else if (p.kind === 'stair') {
      const { x0, dir, N, rise, going } = p;
      for (let k = 0; k < N; k++) {
        const stx = dir > 0 ? x0 + k * going : x0 + (N - 1 - k) * going;
        const sty = y + rise * (k + 1);
        rect(stx, sty - 0.12, going, 0.12, P.steel3);
        rect(stx, sty - 0.12, going, 0.04, P.steel4);
        rect(stx, sty - 0.30, 0.06, 0.18, P.steel1);
        /* the tread plate pattern, two dashes a step */
        rect(stx + 0.08, sty - 0.10, 0.1, 0.04, P.steel2);
        rect(stx + 0.24, sty - 0.10, 0.1, 0.04, P.steel2);
      }
      /* the stringer and the handrail */
      const g2 = gfx();
      const ax = dir > 0 ? x0 : x0 + N * going, ay = y;
      const bx = dir > 0 ? x0 + N * going : x0, by = y + L.storey;
      for (const off of [0, 1.0]) {
        g2.strokeStyle = off ? P.rust2 : P.steel1;
        g2.lineWidth = off ? 2 : 3;
        g2.beginPath();
        g2.moveTo(toScreenX(ax), toScreenY(ay + off));
        g2.lineTo(toScreenX(bx), toScreenY(by + off));
        g2.stroke();
      }
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        rect(ax + (bx - ax) * t, y + L.storey * t, 0.06, 1.0, P.rust2);
      }
    }
  }

  /* --- the drums ----------------------------------------------------------- */
  for (const b of lv.barrels) {
    if (!b.alive || b.f < f0 - 1 || b.f > f1 + 1) continue;
    rect(b.x - 0.36, b.y, 0.72, 1.0, P.gold);
    rect(b.x - 0.36, b.y, 0.16, 1.0, '#f0d060');
    rect(b.x + 0.24, b.y, 0.12, 1.0, '#a07c18');
    /* the hazard chevrons, and the two rolling hoops */
    for (let i = 0; i < 4; i++)
      poly([[0, 0], [0.16, 0], [0.30, 0.42], [0.14, 0.42]],
        b.x - 0.36 + i * 0.20, b.y + 0.3, 0, P.ink);
    rect(b.x - 0.38, b.y + 0.10, 0.76, 0.09, P.rust2);
    rect(b.x - 0.38, b.y + 0.80, 0.76, 0.09, P.rust2);
    rect(b.x - 0.14, b.y + 0.98, 0.28, 0.06, P.rust3);
  }
}

/* THE FOREGROUND. A hanging cable, a length of chain and a girder end,
   all in flat black, drawn over everything. Two or three of them per
   screen and the picture stops being one flat plane - which is the only
   depth cue a game with no depth is allowed. */
export function drawForeground(camY, t) {
  const g = gfx();
  const f = Math.round(camY / L.storey);
  for (let k = -1; k <= 1; k++) {
    const s = hash((f + k) * 71, 3);
    const x = -HX + s * L.span;
    const y = (f + k) * L.storey;
    const kind = ((f + k) * 3 + (s * 4 | 0)) % 3;
    const sway = Math.sin(t * 0.7 + s * 6) * 0.06;
    if (kind === 0) {
      /* a cable looped off the slab above */
      const sx = toScreenX(x), sy = toScreenY(y + L.storey - L.slab);
      g.strokeStyle = P.ink; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + 26 + sway * 40, sy + 44, sx + 58, sy + 6);
      g.stroke();
    } else if (kind === 1) {
      /* a chain, hanging */
      const n = 9;
      for (let i = 0; i < n; i++)
        rect(x + sway * i * 0.12, y + L.storey - L.slab - 0.28 * (i + 1), 0.1, 0.2, P.ink);
    } else {
      /* the end of a beam sticking out over the void */
      rect(x, y + L.storey - L.slab - 0.34, 2.6, 0.3, P.ink);
      rect(x + 0.1, y + L.storey - L.slab - 0.5, 0.22, 0.2, P.ink);
    }
  }
}

/* the crate you walk into to pick an upgrade */
export function drawCrate(c, t) {
  if (c.taken) return;
  const bob = Math.sin(t * 2.4 + c.f) * 0.05;
  const y = c.y + bob;
  rect(c.x - 0.34, y + 0.1, 0.68, 0.56, P.rust2);
  rect(c.x - 0.34, y + 0.1, 0.68, 0.1, P.rust3);
  rect(c.x - 0.34, y + 0.32, 0.68, 0.08, P.rust1);
  rect(c.x - 0.1, y + 0.24, 0.2, 0.2, P.gold);
  /* a glow so you can see it from the floor below */
  const a = 0.35 + Math.sin(t * 5 + c.f) * 0.2;
  rect(c.x - 0.5, y + 0.02, 1.0, 0.06, P.flame);
  rect(c.x - 0.34, y + 0.66, 0.68, 0.05, a > 0.4 ? P.hot : P.flame);
}
