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
import { poly, limb, rect, P, hash } from './pix.js';

/* every measurement, in metres, of the 1.40 m figure */
export const B = {
  h: 1.40,
  hip: 0.38, chest: 0.55, shoulder: 0.70, neck: 0.82,
  headY: 1.11, headW: 0.26, headH: 0.29,     // half-extents
  bodyW: 0.19, bodyH: 0.155,                 // half-extents
  thigh: 0.155, shin: 0.155, foot: 0.15,
  upArm: 0.175, loArm: 0.155,
  halfHip: 0.07, halfSh: 0.125,
  /* THE MUZZLE IS NOT A CONSTANT, because the barrel is not a constant -
     SHORTER BARREL saws a quarter of it off. It used to be pinned at
     0.54 while the gun was drawn out to 0.67, so every flash and every
     pellet left the figure from a point a third of the way back down the
     barrel. `muzzleAt` is the same arithmetic drawGun uses, and it is now
     the only place either of them asks. */
  wrist: 0.33,                               // shoulder to the grip: upArm + loArm
  breech: 0.04,                              // grip to where the barrels start
};
export const muzzleAt = (gunLen) => B.wrist + B.breech + (gunLen === undefined ? 0.30 : gunLen);

/* ---- palettes -------------------------------------------------------------
   A character is five colours and the fifth is the accent. Keeping every
   figure to the same five, only swapped, is what makes the player read
   instantly against a room full of people built the same way. */
export const SKINS = {
  player: { coat: P.coat2, coatLit: P.coat3, coatDark: P.coat1, skin: P.skin, shade: P.skin2, hair: P.hair, acc: P.red, boot: P.ink },
  thug: { coat: P.foe2, coatLit: P.foe3, coatDark: P.foe1, skin: P.skin2, shade: P.skin3, hair: P.ink, acc: P.gold, boot: P.ink },
  heavy: { coat: P.ash, coatLit: P.mid, coatDark: P.slate, skin: P.skin2, shade: P.skin3, hair: P.ink, acc: P.toxic, boot: P.ink },
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
       shoulder has a line on it. In sky6 - the lightest colour in the
       whole palette - across the full width of the shoulders it was not a
       rim, it was a white collar. */
    poly([[-B.bodyW * sx * 0.74, B.bodyH - 0.024], [B.bodyW * sx * 0.74, B.bodyH - 0.024],
      [B.bodyW * sx * 0.74, B.bodyH], [-B.bodyW * sx * 0.74, B.bodyH]],
    bx, by, tilt, P.sky5);
    /* THE BANDOLIER, and it took three goes. Straight down the middle of
       the chest it was a necktie. Straight across it was a bib. A
       bandolier is neither of those things - it is a strap over one
       shoulder and down to the opposite hip, and at this size that
       DIAGONAL is the entire reason it reads as ammunition and not as
       clothing. Four rounds of brass on it, and they go round with the
       figure because the whole strap is drawn at one angle. */
    const sash = tilt + (F > 0 ? 0.66 : -0.66);
    /* SHORT ENOUGH TO STAY ON HIM. A strap long enough to reach corner to
       corner of the torso pokes out of both corners once it is diagonal,
       and a bandolier hanging in the air beside a man is worse than no
       bandolier at all. 0.18 half-length across a 0.38 x 0.31 chest. */
    const SL = 0.18, SW = 0.026;
    poly([[-SL, -SW], [SL, -SW], [SL, SW], [-SL, SW]], bx, by, sash, pal.acc);
    poly([[-SL, -SW], [SL, -SW], [SL, -SW * 0.4], [-SL, -SW * 0.4]], bx, by, sash, P.ink);
    for (let i = -1; i <= 1; i++)
      poly([[i * 0.096 - 0.017, -0.023], [i * 0.096 + 0.017, -0.023],
        [i * 0.096 + 0.017, 0.023], [i * 0.096 - 0.017, 0.023]],
      bx, by, sash, P.gold);
  }

  /* ---- the head ------------------------------------------------------------
     DRAWN ON WHOLE PIXELS, and that is the whole repair.

     The head used to be tilted by up to a fifth of a radian, and every
     feature on it was a polygon rotated by that same amount: an eye white
     two pixels across, a pupil one and a bit inside it, a highlight inside
     that. Rasterised on a rotated grid what came out was not an eye, it was
     three stripes - and turning the figure round dragged the fringe down
     across them and made a domino mask of the whole face. On top of that
     the "jaw shadow" covered the bottom forty-five per cent of the head,
     which does not read as a jaw at this size. It reads as a beard.

     A seventeen-pixel-wide head gets its features placed on whole pixels or
     it gets nothing. So the head does not rotate at all any more, and every
     feature is laid out in PIXELS from the middle of it. The life that the
     tilt was there to provide comes back as the thing it was standing in
     for: the eyes look where the gun is pointing. */
  {
    const up = clamp(-an.headA / 0.30, -1, 1);       // +1 aiming up, -1 down
    const hx = x + leanX * 1.9 + F * 0.012;
    const hy = headYc + up * 0.010 - lean * 0.012;
    const HW = B.headW * sx, HH = B.headH * sy;
    const PXL = 1 / 32;                              // one screen pixel, in metres
    const SH = pal.shade || P.skin2;                 // his skin, one step down

    /* a block of whole pixels on the face, measured from the middle of the
       head in the figure's own terms: +x is the way he is facing, +y up */
    const face = (fx, fy, fw, fh, col) => {
      const x0 = F > 0 ? hx + fx * PXL : hx - (fx + fw) * PXL;
      rect(x0, hy + fy * PXL, fw * PXL, fh * PXL, col);
    };

    /* the skull, corners knocked off - a hexagon is what a rounded shape is
       at this size */
    poly([[-HW, -HH * 0.72], [-HW * 0.72, -HH], [HW * 0.72, -HH], [HW, -HH * 0.72],
      [HW, HH * 0.7], [HW * 0.66, HH], [-HW * 0.66, HH], [-HW, HH * 0.7]],
    hx, hy, 0, pal.skin);
    /* the chin, and ONLY the chin - two pixels of it */
    face(-4, -9, 8, 2, SH);
    /* one pixel of shade down the far cheek. A three-pixel block here was
       a hard vertical seam through the middle of the face; one pixel is a
       cheekbone and nothing else. */
    face(-8, -7, 1, 9, SH);

    /* HAIR. Cut to the skull's own outline - the old trapezoid was
       narrower than the head between the brow and the crown and left two
       tan corners standing out of it like ears. And the hairline sits
       above the brow and STAYS there whichever way he turns. */
    poly([[-HW, HH * 0.40], [-HW, HH * 0.70], [-HW * 0.72, HH],
      [HW * 0.72, HH], [HW, HH * 0.70], [HW, HH * 0.40]], hx, hy, 0, pal.hair);
    face(-8, 4, 16, 2, pal.hair);
    /* a sideburn at the BACK of the head: at this size it is the only
       thing that says which way he is facing when the gun points at you */
    face(-8, 1, 2, 4, pal.hair);
    /* and the rim along the crown, because the sky is behind the building.
       In sky5 against black hair it was a hard cyan stripe that read as a
       headband; a sheen wants to be a step, not a jump. */
    face(-4, 8, 8, 1, P.steel2);

    /* THE EYES. Three pixels of white and two of pupil for the near one,
       two and one for the far one, a single pixel of light in the corner,
       and a heavy brow over each - which is the entire expression budget a
       head this size has. The pupils ride up and down with the aim. */
    const shut = an.blink > 0;
    const pupUp = up > 0.45 ? 1 : (up < -0.45 ? -1 : 0);
    /* the brow is SKIN, one shade down, with a pixel of clear skin between
       it and the hairline. Drawn in the hair colour it simply joined the
       fringe and the face lost its top half. */
    face(1, 2, 4, 1, SH);                       // near brow
    face(-5, 2, 3, 1, SH);                      // far brow
    if (shut) {
      face(1, 0, 4, 1, SH);
      face(-5, 0, 3, 1, SH);
    } else {
      face(1, -2, 4, 4, P.white);                    // near eye
      face(-5, -1, 3, 3, P.white);                   // far eye
      face(3, -2 + pupUp, 2, 3, P.ink);              // near pupil
      face(-4, -1 + pupUp, 2, 2, P.ink);             // far pupil
      face(2, 1, 1, 1, P.white);                     // the catchlight
    }
    /* and a mouth, two pixels of it, which does more work than it looks */
    face(1, -5, 2, 1, SH);
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
  const gunLen = s.gunLen === undefined ? 0.30 : s.gunLen;
  drawGun(wx, wy, aim, kick, gunLen, s.shells);
  /* THE FIST. Without it the forearm simply becomes the gun, and what you
     read from across the room is a long bare arm with a barrel on the end
     of it rather than a man holding something. */
  poly([[-0.078, -0.050], [-0.010, -0.050], [-0.010, 0.050], [-0.078, 0.050]],
    wx, wy, aim, pal.boot);
  poly([[-0.078, -0.050], [-0.010, -0.050], [-0.010, -0.026], [-0.078, -0.026]],
    wx, wy, aim, pal.coatDark);

  const mz = muzzleAt(gunLen);
  return { muzzleX: ox2 + Math.cos(aim) * mz, muzzleY: oy2 + Math.sin(aim) * mz };
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
