/* =====================================================================
   rig2d.js — the chibi, drawn in one frame with no tricks
   =====================================================================
   Every joint here is a position and an angle in world space, computed
   directly. Nothing is parented to anything, nothing is nested inside a
   transform, and nothing is mirrored by scaling a matrix - because every
   single rotation bug in the last version came from one of those three.

   Two helpers do all the work of facing:

       LX(dx)  a sideways offset in the figure's own terms -> world x
       LA(a)   an angle in the figure's own terms          -> world angle

   LA is `PI - a` when facing left, which is a reflection about the
   vertical. Down stays down, forward stays forward, and a leg swinging
   forward swings forward whichever way the figure is pointing.

   THE GUN ARM DOES NOT GO THROUGH EITHER OF THEM. The aim is already a
   world angle, so the shoulder is placed with LX and the arm is drawn at
   exactly `aim`. That is the whole fix: there is no expression anywhere
   in this file of the form `-(aim + something)`.

   PROPORTIONS. The head is 37% of the figure. That is not a stylistic
   shrug - a 1.4 metre chibi at 32 pixels to the metre is 45 pixels tall,
   and giving the head sixteen of them is the only way there is room for
   an eye you can read an expression off. Everything else is short and
   thick for the same reason: a four-pixel limb has no silhouette.
   ===================================================================== */
import { poly, limb, P, hash } from './pix.js';

/* every measurement, in metres, of the 1.40 m figure */
export const B = {
  h: 1.40,
  hip: 0.38, chest: 0.55, shoulder: 0.70, neck: 0.82,
  headY: 1.11, headW: 0.26, headH: 0.29,     // half-extents
  bodyW: 0.19, bodyH: 0.155,                 // half-extents
  thigh: 0.155, shin: 0.155, foot: 0.15,
  upArm: 0.175, loArm: 0.155,
  halfHip: 0.07, halfSh: 0.125,
  muzzle: 0.54,                              // shoulder to the end of the barrel
};

/* ---- palettes -------------------------------------------------------------
   A character is five colours and the fifth is the accent. Keeping every
   figure to the same five, only swapped, is what makes the player read
   instantly against a room full of people built the same way. */
export const SKINS = {
  player: { coat: P.coat2, coatLit: P.coat3, coatDark: P.coat1, skin: P.skin, hair: P.hair, acc: P.red, boot: P.ink },
  thug: { coat: P.foe2, coatLit: P.foe3, coatDark: P.foe1, skin: P.skin2, hair: P.ink, acc: P.gold, boot: P.ink },
  heavy: { coat: P.ash, coatLit: P.mid, coatDark: P.slate, skin: P.skin2, hair: P.ink, acc: P.toxic, boot: P.ink },
};

/* ---- the animation state a figure carries around ------------------------- */
export function makeAnim() {
  return { phase: 0, lean: 0, leanV: 0, headA: 0, land: 0, fire: 0, blink: 0, blinkT: 2 + Math.random() * 3 };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function stepAnim(an, s, dt) {
  const speed = Math.abs(s.vx || 0);
  const run = clamp(speed / 7, 0, 1);
  /* THE CYCLE IS WARPED. A plain sine spends as long passing as it does
     planting, which is the marionette look; a real stride is quick through
     the contact and slow through the swing. */
  const stride = 0.44 + run * 0.3;
  if (s.grounded) an.phase += (speed / stride) * dt * 2.1;
  else an.phase += dt * 1.4;
  an.raw = an.phase % 6.2832;
  an.warp = an.raw + Math.sin(an.raw * 2) * 0.3;

  /* the lean is a spring, so it overshoots when you stop - and that
     overshoot is the entire sensation of the figure having weight */
  const want = clamp((s.ax || 0) * 0.02, -0.34, 0.34);
  an.leanV += (want - an.lean) * 44 * dt;
  an.leanV *= Math.exp(-8.5 * dt);
  an.lean += an.leanV * dt;

  if (s.landed) an.land = 1;
  an.land = Math.max(0, an.land - dt * 4.4);
  if (s.fired) an.fire = 1;
  an.fire = Math.max(0, an.fire - dt * 5.5);

  /* the head lags behind the aim, which is most of what makes a big head
     look heavy rather than pasted on */
  const wantHead = clamp(-Math.sin(s.aim || 0) * 0.30, -0.4, 0.4);
  an.headA += (wantHead - an.headA) * clamp(dt * 10, 0, 1);

  an.blinkT -= dt;
  if (an.blinkT <= 0) { an.blink = 0.11; an.blinkT = 2.2 + Math.random() * 3.4; }
  an.blink = Math.max(0, an.blink - dt);
  an.run = run;
}

/* =====================================================================
   DRAWING
   ===================================================================== */
export function drawFigure(s, an, pal) {
  const F = s.facing >= 0 ? 1 : -1;
  const x = s.x, y = s.y;
  const LX = (dx) => x + dx * F;
  const LA = (a) => (F > 0 ? a : Math.PI - a);

  const squash = an.land * an.land;
  const kick = an.fire * an.fire;
  const lean = an.lean;
  /* the whole figure compresses on a landing and stretches going up */
  const sy = 1 - squash * 0.20 + clamp((s.vy || 0) * 0.012, -0.06, 0.14);
  const sx = 1 + squash * 0.16;
  const Y = (v) => y + (v) * sy;                 // a height up the figure
  const bob = s.grounded ? Math.abs(Math.sin(an.warp)) * 0.022 * an.run : 0;

  const hipY = Y(B.hip) + bob;
  const chestY = Y(B.chest) + bob;
  const shY = Y(B.shoulder) + bob;
  const headYc = Y(B.headY) + bob;
  const leanX = lean * 0.10;

  /* ---- legs ---------------------------------------------------------------
     Drawn back leg first. The knee never bends the wrong way because the
     shin's angle is the thigh's angle minus a positive number, always. */
  const legs = [];
  for (const side of [1, -1]) {
    const ph = an.warp + (side > 0 ? 0 : Math.PI);
    let thigh, bend;
    if (s.grounded) {
      thigh = -Math.PI / 2 + Math.sin(ph) * (0.52 + an.run * 0.55) - lean * 0.5;
      bend = Math.max(0, Math.sin(ph - 0.7)) * (0.7 + an.run * 0.95) + 0.07;
    } else {
      const tuck = clamp(0.45 + (s.vy || 0) * 0.05, 0.1, 1.15);
      thigh = -Math.PI / 2 + (side > 0 ? 0.42 : -0.30) * tuck;
      bend = 0.55 + tuck * 0.75;
    }
    thigh -= squash * 0.55;
    bend += squash * 1.15;
    legs.push({ side, thigh: LA(thigh), shin: LA(thigh - bend) });
  }
  const drawLeg = (L, dark) => {
    const hx = LX(L.side * B.halfHip * 0.7) + leanX;
    const c = dark ? pal.coatDark : pal.boot;
    limb(hx, hipY, B.thigh, 0.145, L.thigh, dark ? pal.coatDark : P.deep);
    const kx = hx + Math.cos(L.thigh) * B.thigh;
    const ky = hipY + Math.sin(L.thigh) * B.thigh;
    limb(kx, ky, B.shin, 0.125, L.shin, dark ? pal.coatDark : P.deep);
    const ax = kx + Math.cos(L.shin) * B.shin;
    const ay = ky + Math.sin(L.shin) * B.shin;
    /* the boot: a wedge pointing the way the figure faces */
    poly([[-0.05, -0.04], [B.foot, -0.04], [B.foot - 0.02, 0.055], [-0.05, 0.055]],
      ax, ay, LA(0) + (F > 0 ? 0 : 0), c, F < 0);
    return { ax, ay };
  };
  drawLeg(legs[1], true);

  /* ---- the coat, behind the body ------------------------------------------ */
  {
    const flap = clamp(-(s.vx || 0) * F * 0.035, -0.5, 0.5) + clamp((s.vy || 0) * 0.02, -0.3, 0.3)
      + Math.sin(an.warp) * 0.08 * an.run;
    const back = LX(-0.06) + leanX;
    poly([[-0.02, 0], [0.10, 0], [0.16 + flap * 0.2, -0.30], [-0.10 + flap * 0.34, -0.34]],
      back, hipY + 0.06, LA(Math.PI) , pal.coatDark, F < 0);
  }

  drawLeg(legs[0], false);

  /* ---- the far arm, behind the body --------------------------------------- */
  {
    const sw = Math.sin(an.warp + Math.PI);
    let a1, a2;
    if (s.grounded) {
      a1 = -Math.PI / 2 + sw * (0.55 + an.run * 0.6) + lean * 0.4;
      a2 = a1 - 0.32 - Math.max(0, sw) * 0.6;
    } else {
      a1 = -Math.PI / 2 - 0.85; a2 = a1 - 0.75;
    }
    a1 -= kick * 0.9; a2 -= kick * 0.5;
    const hx = LX(-B.halfSh * 0.55) + leanX, hy = shY;
    limb(hx, hy, B.upArm, 0.105, LA(a1), pal.coatDark);
    const ex = hx + Math.cos(LA(a1)) * B.upArm, ey = hy + Math.sin(LA(a1)) * B.upArm;
    limb(ex, ey, B.loArm, 0.095, LA(a2), pal.coatDark);
  }

  /* ---- the body ----------------------------------------------------------- */
  {
    const bx = x + leanX * 1.4, by = chestY;
    const tilt = LA(-Math.PI / 2 - lean * 0.3) + Math.PI / 2;
    poly([[-B.bodyW * sx, -B.bodyH], [B.bodyW * sx, -B.bodyH],
      [B.bodyW * sx * 0.92, B.bodyH], [-B.bodyW * sx * 0.92, B.bodyH]],
    bx, by, tilt, pal.coat);
    /* the lit top edge - two-tone shading, which is all a sprite gets */
    poly([[-B.bodyW * sx * 0.92, B.bodyH * 0.34], [B.bodyW * sx * 0.92, B.bodyH * 0.34],
      [B.bodyW * sx * 0.92, B.bodyH], [-B.bodyW * sx * 0.92, B.bodyH]],
    bx, by, tilt, pal.coatLit);
    /* and the rim: the sky is behind the building, so the top of every
       shoulder has a hard bright line on it */
    poly([[-B.bodyW * sx * 0.92, B.bodyH - 0.028], [B.bodyW * sx * 0.92, B.bodyH - 0.028],
      [B.bodyW * sx * 0.92, B.bodyH], [-B.bodyW * sx * 0.92, B.bodyH]],
    bx, by, tilt, P.sky6);
    /* the bandolier across the chest, and the shells in it */
    poly([[-0.045, -B.bodyH], [0.045, -B.bodyH], [0.045, B.bodyH], [-0.045, B.bodyH]],
      bx + F * 0.045, by, tilt, pal.acc);
    for (let i = 0; i < 3; i++)
      poly([[-0.028, -0.022], [0.028, -0.022], [0.028, 0.022], [-0.028, 0.022]],
        bx + F * 0.045, by - 0.09 + i * 0.09, tilt, P.gold);
  }

  /* ---- the head ------------------------------------------------------------
     Big, and it leads the body: the neck angle lags the aim, so when you
     whip the gun round the head arrives a beat later. */
  {
    const hA = an.headA * 0.5 - lean * 0.5;
    const hx = x + leanX * 1.9 + F * 0.012, hy = headYc;
    const tilt = LA(-Math.PI / 2 + hA) + Math.PI / 2;
    const HW = B.headW * sx, HH = B.headH * sy;
    /* the skull, with the corners knocked off - a rounded rect made of a
       hexagon, which is what a rounded shape is at this size */
    poly([[-HW, -HH * 0.72], [-HW * 0.72, -HH], [HW * 0.72, -HH], [HW, -HH * 0.72],
      [HW, HH * 0.7], [HW * 0.66, HH], [-HW * 0.66, HH], [-HW, HH * 0.7]],
    hx, hy, tilt, pal.skin);
    /* the rim over the crown, same light */
    poly([[-HW * 0.7, HH - 0.03], [HW * 0.7, HH - 0.03], [HW * 0.66, HH], [-HW * 0.66, HH]],
      hx, hy, tilt, P.sky6);
    /* the jaw shadow */
    poly([[-HW * 0.9, -HH], [HW * 0.9, -HH], [HW * 0.86, -HH * 0.55], [-HW * 0.86, -HH * 0.55]],
      hx, hy, tilt, P.skin2);
    /* hair: a cap over the crown and a fringe that overhangs the brow */
    poly([[-HW, HH * 0.16], [-HW * 0.72, HH], [HW * 0.72, HH], [HW, HH * 0.16],
      [HW * 0.8, HH * 0.3], [-HW * 0.8, HH * 0.3]], hx, hy, tilt, pal.hair);
    poly([[-HW * 0.7, HH - 0.028], [HW * 0.7, HH - 0.028], [HW * 0.64, HH], [-HW * 0.64, HH]],
      hx, hy, tilt, P.sky5);
    poly([[-HW, HH * 0.16], [HW * 0.25, HH * 0.16], [HW * 0.55, HH * 0.44], [-HW, HH * 0.5]],
      hx, hy, tilt, pal.hair, F < 0);
    /* THE EYES. Two of them, both visible, the far one smaller and nearer
       the edge - which is how every chibi in the world is drawn in
       three-quarter and reads as looking where the gun is pointing. */
    const open = an.blink > 0 ? 0.12 : 1;
    for (const [ox, w2, h2] of [[0.115, 0.066, 0.082], [-0.062, 0.052, 0.070]]) {
      const ex = ox * F, ew = w2, eh = h2 * open;
      poly([[ex - ew, -eh], [ex + ew, -eh], [ex + ew, eh], [ex - ew, eh]],
        hx, hy - 0.005, tilt, P.white);
      poly([[ex - ew * 0.55 + F * 0.012, -eh * 0.9], [ex + ew * 0.55 + F * 0.012, -eh * 0.9],
        [ex + ew * 0.55 + F * 0.012, eh * 0.9], [ex - ew * 0.55 + F * 0.012, eh * 0.9]],
      hx, hy - 0.005, tilt, P.ink);
      if (open > 0.5)
        poly([[ex + ew * 0.1, eh * 0.2], [ex + ew * 0.5, eh * 0.2],
          [ex + ew * 0.5, eh * 0.75], [ex + ew * 0.1, eh * 0.75]],
        hx, hy - 0.005, tilt, P.white);
    }
    /* and a mouth, which is one dark pixel wide and does a lot of work */
    poly([[-0.028 + F * 0.06, -0.012], [0.028 + F * 0.06, -0.012],
      [0.028 + F * 0.06, 0.012], [-0.028 + F * 0.06, 0.012]],
    hx, hy - 0.13, tilt, P.skin2);
  }

  /* ---- THE GUN ARM ---------------------------------------------------------
     Straight out along the aim. `aim` is a world angle and this draws at
     `aim`. Not -aim, not aim plus a quarter turn, not something times the
     facing. If the crosshair is up and to the left, the barrel is up and
     to the left, and nothing in between can make it otherwise. */
  const gx = LX(B.halfSh * 0.5) + leanX * 1.2;
  const gy = shY - 0.01;
  const aim = s.aim || 0;
  const recoil = kick * 0.12;
  const ox2 = gx - Math.cos(aim) * recoil, oy2 = gy - Math.sin(aim) * recoil;
  limb(ox2, oy2, B.upArm, 0.115, aim, pal.coat);
  const ex2 = ox2 + Math.cos(aim) * B.upArm, ey2 = oy2 + Math.sin(aim) * B.upArm;
  limb(ex2, ey2, B.loArm, 0.10, aim, pal.skin);
  const wx = ex2 + Math.cos(aim) * B.loArm, wy = ey2 + Math.sin(aim) * B.loArm;
  drawGun(wx, wy, aim, kick, s.gunLen || 0.30, s.shells);

  return { muzzleX: ox2 + Math.cos(aim) * B.muzzle, muzzleY: oy2 + Math.sin(aim) * B.muzzle };
}

/* ---- the sawed-off --------------------------------------------------------
   Thirty pixels long and it has to read at a glance, so it is all
   silhouette: two fat barrels, a hammer standing up off the action, and a
   stock cut off square. The barrel length is a variable because one of
   the upgrades saws more off it. */
export function drawGun(x, y, ang, kick, len, shells) {
  const back = -0.16 - kick * 0.06;
  /* the stock */
  poly([[back, -0.055], [back + 0.13, -0.045], [back + 0.13, 0.05], [back, 0.075]],
    x, y, ang, P.rust2);
  poly([[back, -0.055], [back + 0.13, -0.045], [back + 0.13, -0.015], [back, -0.02]],
    x, y, ang, P.rust3);
  /* the action, and the hammer spur standing up off it */
  poly([[back + 0.11, -0.05], [back + 0.20, -0.05], [back + 0.20, 0.05], [back + 0.11, 0.05]],
    x, y, ang, P.steel2);
  poly([[back + 0.13, 0.04], [back + 0.165, 0.04], [back + 0.16, 0.10], [back + 0.135, 0.10]],
    x, y, ang, P.steel3);
  poly([[back + 0.15, -0.05], [back + 0.175, -0.05], [back + 0.175, -0.10], [back + 0.15, -0.10]],
    x, y, ang, P.steel1);
  /* two barrels, over and under, and the cut muzzle */
  for (const o of [-0.026, 0.026]) {
    poly([[back + 0.18, o - 0.023], [back + 0.18 + len, o - 0.023],
      [back + 0.18 + len, o + 0.023], [back + 0.18, o + 0.023]], x, y, ang, P.steel1);
    poly([[back + 0.18, o + 0.008], [back + 0.18 + len, o + 0.008],
      [back + 0.18 + len, o + 0.023], [back + 0.18, o + 0.023]], x, y, ang, P.steel2);
  }
  poly([[back + 0.17 + len, -0.058], [back + 0.20 + len, -0.058],
    [back + 0.20 + len, 0.058], [back + 0.17 + len, 0.058]], x, y, ang, P.steel3);
  /* the loaded shells show at the breech - you can count them on the gun */
  for (let i = 0; i < Math.min(2, shells || 0); i++)
    poly([[back + 0.155, (i ? 0.026 : -0.026) - 0.014], [back + 0.185, (i ? 0.026 : -0.026) - 0.014],
      [back + 0.185, (i ? 0.026 : -0.026) + 0.014], [back + 0.155, (i ? 0.026 : -0.026) + 0.014]],
    x, y, ang, P.red);
}
