// The skater is a posed rig, not a sheet of frames: limbs are two-bone IK
// chains drawn as thick pixel lines with an ink outline. That is what lets the
// pose follow the physics -- the crouch depth is literally how hard you are
// leaning on the mouse, and the knees fold as the feet tuck up in the air.
//
// Body rotation (your 180s) works the same way the deck's shove-it does: the
// whole rig squashes horizontally by |cos(spin)| and flips which way it faces
// when the cosine crosses zero.
//
// Proportions are in local units with y UP and the origin at the wheels: feet
// 5.8, hip 16, shoulder 24, top of head ~31, all scaled by the chosen build.
//
// Everything wearable arrives in `look` (see game/wardrobe.js). The art code has
// no idea a shop exists -- it only sees colours and style flags.
//
// DRAW ORDER MATTERS: legs go down BEFORE the deck and the shoes go on AFTER,
// so baggy denim sits behind the board and the shoes stand on top of it. Draw
// the legs last and a wide leg swallows the whole deck.

import { P } from './palette.js';

const FOOT_Y = 5.8;   // the top of the deck, so the shoes stand ON it
const THIGH = 5.7, SHIN = 5.7;
const UPPER = 4.3, FORE = 4.3;

// How each denim fit is DRAWN. There are two, and they are one rung lower than
// they used to be: SLIM is a thin leg standing wide enough to show daylight
// between the knees, BAGGY is the wider straight leg that hangs to the shoe.
// Anything fatter than baggy drew as two blocks of colour with no shape in
// them, so there is nothing fatter than baggy.
//
// `stance` is how far apart the feet stand -- a slim leg stands WIDEST, because
// the gap is the whole look. `taper` is how much of the thigh's width the shin
// keeps.
const FITS = {
  slim: { thick: 2, stance: 2.4, cuff: 0, taper: 0.62 },
  baggy: { thick: 3, stance: 1.6, cuff: 0, taper: 0.85 },
};

const PLAIN = {
  build: { shoulder: 1, hip: 1, height: 1 },
  skin: { c1: P.skin1, c2: P.skin2, c3: P.skin3 },
  hair: { style: 'short', c1: P.hair1, c2: P.hair2 },
  hat: { kind: 'cap', c1: P.cap1, c2: P.cap2, back: false },
  face: { kind: 'none', c1: '#000', c2: '#000' },
  eyes: { c1: '#4a2f1c', c2: '#2c1b10' },
  shirt: { c1: P.tee1, c2: P.tee2, c3: P.tee3, print: 'none', sleeve: false, stripes: false },
  mid: { kind: 'none', c1: '#000', c2: '#000', c3: '#000', print: 'none', full: false },
  over: { kind: 'none', c1: '#000', c2: '#000', c3: '#000', print: 'none', full: false },
  legs: { c1: P.jean1, c2: P.jean2, c3: P.jean3, fit: 'slim', loop: false, short: 0 },
  socks: { kind: 'none', c1: '#fff', c2: '#ccc', stripe: false },
  shoes: { c1: P.shoe3, c2: '#4e4740', sole: P.shoe1, checker: false, hi: false },
};

export function drawSkater(v, sk, board, t, deck, look) {
  const L = look || PLAIN;
  const B = L.build || PLAIN.build;
  const fit = FITS[L.legs.fit] || FITS.slim;
  const spin = sk.bodySpin || 0;
  let squash = Math.cos(spin);
  const facing = (squash < 0 ? -1 : 1) * sk.dir;
  squash = Math.max(0.18, Math.abs(squash));

  let ang = sk.ang;
  // A bail lays the rider DOWN and slides them along the floor. It used to add
  // bailSpin here, which cartwheeled the whole rig; that number now belongs to
  // the loose board, which is the thing that actually tumbles.
  if (sk.state === 'bail') ang += sk.bailLean || 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  const ox = sk.x, oy = sk.y;

  // A point in the rider's local frame, turned by the body spin and flattened.
  //
  // `lz` is DEPTH -- across the board, positive toward the camera -- and it is
  // the whole reason a 180 reads as a person turning rather than a cut-out
  // being squeezed. With every point at z = 0 the projection below collapses to
  // `lx * cos(spin)`, which scales the pose horizontally and changes nothing
  // else: paper on a stick. Give the arms real depth and a quarter turn swings
  // them apart on screen instead of folding them onto the centre line.
  //
  // Returns [screenX, screenY, depth]; depth decides what is drawn over what.
  const cs = Math.cos(spin), sn = Math.sin(spin);
  function pt(lx, ly, lz) {
    const z = lz || 0;
    let rx = lx * cs - z * sn;
    const rz = lx * sn + z * cs;
    // never let the rig collapse to a literal line when it is edge on
    if (Math.abs(cs) < 0.18 && !z) rx = lx * 0.18 * Math.sign(cs || 1);
    const fx = rx * sk.dir;
    return [ox + fx * c + ly * s, oy + fx * s - ly * c, rz];
  }

  const air = sk.state === 'air';
  const bailing = sk.state === 'bail';
  // ON FOOT. The stance opens up into a stride, the crouch goes away, and the
  // arm nearest the camera hangs down to carry the board.
  // ON FOOT is a BLEND, not a switch. `mount` runs 0..1 while the rider picks
  // the board up or steps back onto it, so every number below eases across
  // instead of snapping -- that transition is the getting-on animation.
  const W = sk.mount || 0;
  const walking = W > 0.002;
  const step = walking ? Math.sin(sk.walkPhase || 0) * W : 0;
  const duck = walking ? (sk.walkCrouch || 0) * W : 0;
  // the hop: up and back down on a curve, so it lands rather than teleporting
  const hopT = sk.hopT || 0;
  const hop = walking ? Math.sin(hopT * Math.PI) * 5.2 * W : 0;
  const cr = Math.min(1.15, sk.crouch);
  const H = B.height;

  // --- the air pose -----------------------------------------------------------
  // Standing to attention through a kickflip looks dead. In the air the knees
  // come UP and APART, the body tips into the direction of travel and pitches
  // back as you rise, the arms counter-rotate against whatever spin is running,
  // and the whole thing carries a small wobble. That is roughly what a person
  // does to hold a rotation together, and it is the difference between a rider
  // and a mannequin on a stick.
  const airT = air ? Math.min(1, sk.airTime * 5) : 0;
  const spinRate = air ? clamp((sk.bodySpinV || 0) / 6, -1, 1) : 0;
  // HOW MUCH IS ACTUALLY HAPPENING. A straight ollie is not a tre flip and it
  // should not be posed like one -- the hard tuck, the wobble and the wound-up
  // arms belong to a rotation that is really running, not to being airborne.
  // Without this every jump wore the same wound-up animation.
  const deckSpin = board
    ? Math.abs(board.rollV || 0) + Math.abs(board.yawV || 0) + Math.abs(board.pitchV || 0)
    : 0;
  const busy = air ? clamp(Math.abs(sk.bodySpinV || 0) / 6 + deckSpin / 13, 0, 1) : 0;

  // THE GRAB. A hand goes to a point on the deck, the knees come up to bring
  // the board to meet it, the body folds over it and -- for the big ones -- a
  // foot comes off entirely. It eases in over about a fifth of a second so the
  // rider reaches for the board rather than snapping onto it.
  // S: the rider holds the board out to be looked at. It borrows the grab
  // machinery -- one hand on the deck, knees up out of the way -- because that
  // is the same shape as holding anything out in front of you.
  const showT = sk.showT || 0;
  const pose = air ? sk.pose : null;
  const grab = pose ? Math.min(1, (sk.poseT || 0) / 0.2) : showT;
  const P2 = pose
    || (showT > 0 ? { where: 0.1, tuck: 2.6, push: 5.2, lean: 1.0, kick: 0, arms: 0 }
      : { where: 0, tuck: 0, push: 0, lean: 0, kick: 0, arms: 0 });
  const lean = air ? clamp((sk.vx || 0) / 190, -1, 1) * facing : 0;
  const rise = air ? clamp(-(sk.vy || 0) / 190, -1, 1) : 0;
  // a relaxed float when nothing is turning, a real tuck when something is
  const tuck = airT * (1.0 + busy * 2.4 + rise * 1.1) + (P2.tuck || 0) * grab * 1.5;
  // Arms windmill for the instant you are still falling, then go out in front
  // of you the way they do when you are scraping along on your side.
  const slide = bailing ? (sk.bailSlide || 0) : 0;
  const flail = bailing ? Math.sin(t * 24) * 3.5 * (1 - slide) : 0;
  const wob = air ? Math.sin(t * 7 + sk.airTime * 5) * 0.55 * airT * (0.2 + busy * 0.8) : 0;

  // HOW HARD THE AIR IS HITTING YOU. One number, fed to every loose thing on
  // the rider -- hems, cuffs, hood, hair, drawstrings -- so they all answer to
  // the same wind instead of each having their own idea of how fast you are
  // going. Standing still it is zero and everything hangs.
  const through = Math.max(Math.abs(sk.v || 0), Math.abs(sk.vx || 0));
  const wind = bailing ? 0.2
    : sk.state === 'walk' ? (0.16 + Math.abs(Math.sin(sk.walkPhase || 0)) * 0.12) * (sk.mount || 0)
      : Math.min(1.35, through / 165 + (air ? 0.22 : 0));
  // Cloth trails BEHIND you, so which way it streams is which way you are
  // going -- not which way you are facing.
  const stream = -Math.sign(sk.vx || sk.v || sk.dir || 1) * sk.dir;
  const anim = { t, wind, stream, squash };
  // and a breath when you are barely moving, so a parked rider is not a statue
  const breath = Math.sin(t * 1.9) * 0.35 * (1 - Math.min(1, through / 60));

  // --- joints ---------------------------------------------------------------
  // Once you are down, the whole rig collapses toward the floor: hips low,
  // shoulders lower still, legs trailing out behind.
  // Riding, the origin is at the WHEELS and the shoes stand 5.8 above it, on
  // the deck. On foot there is no deck under them, so the feet belong on the
  // floor -- and the hip has to come down the same distance, or the legs just
  // stretch and the rider ends up hovering.
  const footY = (FOOT_Y + tuck) * (1 - W) + (0.4 + hop) * W;
  const hipY = ((16.0 - cr * 5.2 - tuck * 0.42 + (bailing ? -3.2 : 0)) * (1 - W)
    + (10.7 - Math.abs(step) * 0.7 - duck * 3.4 + hop) * W) * H;
  const hipX = -1.2 - cr * 1.0 + lean * 1.5 - (P2.lean || 0) * grab * 1.1;
  const shY = hipY + (8.2 - cr * 1.4 - airT * 0.7 - slide * 1.1) * H + breath;
  const shX = hipX + 2.2 + cr * 1.4 + lean * 2.0 + wob + slide * 1.4;
  const headY = shY + 4.4;
  // Through a turn the shoulders lead the hips and the head leads the
  // shoulders -- you spot the landing before your body gets there. Without it
  // the whole rig turns as one rigid plank.
  const twist = clamp((sk.bodySpinV || 0) / 8, -1, 1) * 1.9;
  const headX = shX + 1.0 + cr * 0.5 + lean * 1.0 + twist * 0.8 + (P2.lean || 0) * grab * 2.2;

  const roll = Math.min(1, Math.abs(sk.v) / 130);
  const sway = Math.sin(t * 3.4) * (air ? 0 : 1.5 * roll);


  // Hands sit INSIDE the arm's reach (8.6) so the elbow always has a bend in it.
  // Where the deck is, in the rider's own coordinates -- the point a grabbing
  // hand has to reach. Its half-length is 9.5 and it rides 4.6 above the origin.
  const deckX = (P2.where || 0) * 8.6 + (P2.push || 0) * grab * 1.2;
  const deckY = footY - 0.6;
  const grabB = pose && pose.hand === 'back' ? grab : 0;
  const grabF = pose ? (pose.hand === 'front' ? grab : 0) : showT;
  // the free hand goes wide for balance, or wider still on a christ air
  const wide = (P2.arms || 0) * grab;

  const bHand = bailing
    ? [-5.4 - slide * 1.6, shY - 2.0 + flail]
    : air ? [
      lerp1(-7.2 - spinRate * 2.4, deckX, grabB) - wide * 3.2,
      lerp1(shY - 0.4 - airT * 2.6 + flail + wob, deckY, grabB),
    ]
      : walking ? [(-3.4 - step * 2.6) * W + (-6.6 - cr) * (1 - W),
        (shY - 7.4) * W + (shY - 3.4 + sway) * (1 - W)]
        : [-6.6 - cr, shY - 3.4 + sway];
  // the leading arm goes OUT, bracing along the floor you are sliding on
  const fHand = bailing
    ? [6.6 + slide * 2.4, shY - 4.6 - flail - slide * 1.2]
    : air ? [
      lerp1(7.4 - spinRate * 1.8, deckX, grabF) + wide * 3.2,
      lerp1(shY - 4.0 - airT * 3.2 - flail - wob, deckY, grabF),
    ]
      : walking ? [4.6 * W + (6.4 + cr) * (1 - W),
        (shY - 8.6) * W + (shY - 4.4 - sway) * (1 - W)]
        : [6.4 + cr, shY - 4.4 - sway];

  // knees apart in the air, and the stance widens or narrows with the fit
  const spread = (air ? (0.4 + 1.5 * busy) * airT : 0) + fit.stance + 0.6 * W
    + Math.abs(P2.kick || 0) * grab * 1.4;
  // ARM DEPTH: a skater's arms are not in the plane of their chest, they are out
  // in front and behind it. These four numbers are what a body spin actually
  // rotates -- the rest of the rig has no thickness worth speaking of.
  const AZ = 2.0, HZ = 3.4;
  const hip = pt(hipX, hipY);
  const shF = pt(shX + 0.9 * B.shoulder + twist, shY, AZ);
  const shB = pt(shX - 0.9 * B.shoulder + twist, shY - 0.4, -AZ);
  const shMid = pt(shX + twist, shY);
  const head = pt(headX, headY);
  // legs trailing out behind, knees together, the way they end up when you go
  // down on your side and keep going
  const kickB = (P2.kick || 0) > 0 ? grab * ((P2.kick || 0) > 1 ? 7.5 : 6.0) : 0;
  const kickF = (P2.kick || 0) < 0 || (P2.kick || 0) > 1 ? grab * 6.5 : 0;
  const bFoot = pt(-4.6 - spread * 0.3 - slide * 3.4 + (3.4 - step * 5.0) * W - kickB,
    footY + (bailing ? 3.5 : 0) + Math.max(0, -step) * 2.8 * W);
  const fFoot = pt(4.2 + spread * 0.3 - slide * 5.2 - (3.2 + step * 5.0) * W + kickF,
    footY * (bailing ? 1.25 : 1) + (air ? -0.6 : 0) + Math.max(0, step) * 2.8 * W);
  const bHandP = pt(bHand[0], bHand[1], -HZ);
  const fHandP = pt(fHand[0], fHand[1], HZ);
  const bHip = pt(hipX - spread * 0.42, hipY);
  const fHip = pt(hipX + spread * 0.42, hipY);

  const kneeBend = -facing;
  const elbowBend = facing;
  const legThick = fit.thick;
  // A slim leg keeps tapering below the knee; a baggy one holds more of it.
  const shinThick = Math.max(2, Math.round(fit.thick * (fit.taper || 1)));
  const shortLeg = L.legs.short || 0;
  const shin = shortLeg ? L.skin.c2 : L.legs.c2;
  const shinB = shortLeg ? L.skin.c3 : L.legs.c3;

  // THREE LAYERS: a shirt, a jumper over it, a jacket over that. Any of them
  // can be missing, so nothing below may assume a particular one is there.
  const over = L.over || PLAIN.over;
  const mid = L.mid || PLAIN.mid;
  const shirt = L.shirt || PLAIN.shirt;
  const hasOver = over.kind !== 'none';
  const hasMid = mid.kind !== 'none';

  // Sleeves belong to the OUTERMOST garment that actually has them, which is
  // not the same as the outermost garment: a gilet is sleeveless, so the arm
  // coming out of one is the jumper's, or the shirt's, or bare. Walk down.
  const sleeved = (g) => g && g.kind !== 'none' && g.kind !== 'vest';
  const armOf = sleeved(over) ? over : sleeved(mid) ? mid : null;
  const bareArm = !armOf && shirt.tank;
  const sleeve1 = bareArm ? L.skin.c1 : armOf ? armOf.c1 : shirt.c1;
  const sleeve2 = bareArm ? L.skin.c2 : armOf ? armOf.c2 : shirt.c2;
  const longArm = !!armOf || (!bareArm && shirt.sleeve);
  const cuffC1 = longArm ? sleeve1 : L.skin.c1;
  const cuffC2 = longArm ? sleeve2 : L.skin.c2;

  // WHICH ARM IS IN FRONT is decided by depth, not by which one it was when the
  // rider was standing still. Halfway through a spin they trade places, and the
  // far one goes dark. That swap is most of what sells the rotation -- lock the
  // order and the arms slide through each other like a printed decal.
  const armF = { sh: shF, hand: fHandP, z: fHandP[2] };
  const armB = { sh: shB, hand: bHandP, z: bHandP[2] };
  const nearArm = armF.z >= armB.z ? armF : armB;
  const farArm = armF.z >= armB.z ? armB : armF;

  // --- the far arm, behind everything ---------------------------------------
  limb(v, farArm.sh, farArm.hand, UPPER, FORE, 3, sleeve2, cuffC2, elbowBend);

  // --- legs, both, BEFORE the deck ------------------------------------------
  const bKnee = limb(v, bHip, bFoot, THIGH * H, SHIN * H, legThick, L.legs.c2, shinB, kneeBend, shinThick);
  const fKnee = limb(v, fHip, fFoot, THIGH * H, SHIN * H, legThick, L.legs.c1, shin, kneeBend, shinThick);
  if (L.legs.stripe && !shortLeg) {
    v.line(fHip[0], fHip[1], fKnee[0], fKnee[1], L.legs.c3);
    v.line(fKnee[0], fKnee[1], fFoot[0], fFoot[1], L.legs.c3);
  }

  // an outseam and a knee crease -- the two lines that stop a baggy leg from
  // reading as a plain bar of colour
  if (!shortLeg && legThick >= 3) {
    seam(v, fHip, fKnee, fFoot, legThick, L.legs.c3);
  }
  if (shortLeg) {
    hem(v, bKnee, bFoot, shortLeg, legThick, squash, L.legs.c3);
    hem(v, fKnee, fFoot, shortLeg, legThick, squash, L.legs.c2);
  } else if (fit.cuff || L.legs.sweat) {
    // sweats and joggers gather at the ankle whatever their fit
    const amt = L.legs.sweat ? Math.max(0.5, fit.cuff) : fit.cuff;
    cuff(v, bFoot, ang, facing, squash, shinThick, amt, L.legs.c3, anim, 0);
    cuff(v, fFoot, ang, facing, squash, shinThick, amt, L.legs.c2, anim, 2.4);
  }
  if (L.legs.loop) v.line(fHip[0], fHip[1] + 3, fKnee[0], fKnee[1], L.legs.c3);

  sock(v, bFoot, ang, facing, squash, L.socks, legThick, true);
  sock(v, fFoot, ang, facing, squash, L.socks, legThick, false);

  // --- the deck ---------------------------------------------------------------
  // Under your feet it goes here, between the far leg and the near one. Under
  // your ARM it goes further up the order -- see below, just before the near
  // arm, so the arm closes over it.
  const carrying = W > 0.5;
  if (deck && !carrying) deck();

  // --- shoes, standing on it --------------------------------------------------
  shoe(v, bFoot, ang, facing, squash, true, L.shoes, L.skin);
  shoe(v, fFoot, ang, facing, squash, false, L.shoes, L.skin);

  // --- body -------------------------------------------------------------------
  // The SHIRT goes on first and hangs to the hip; the jacket over it stops
  // short, so a strip of shirt shows below the hem. That one detail is most of
  // what makes layers read as layers instead of one recoloured block.
  // The torso runs up the CENTRE of the shoulders, not to one of them -- with
  // the shoulders now at real depth, hanging it off shF made the body lurch
  // sideways every time the rider turned.
  // The hood belongs to whichever layer is a hoodie -- worn under a jacket it
  // still sits behind your head, which is half the reason people wear it that
  // way. The jacket wins if somehow both are hoodies.
  const hooded = over.kind === 'hoodie' ? over : mid.kind === 'hoodie' ? mid : null;
  if (hooded) hood(v, head, shMid, facing, squash, hooded, anim);

  // Each layer is drawn shorter and wider than the one under it, so a strip of
  // every garment shows below the hem of the next. That one detail is most of
  // what makes layers read as layers instead of one recoloured block -- and
  // each gets its OWN phase, because three hems moving in lockstep read as one
  // printed thing rather than three pieces of cloth.
  const layers = Math.min(2, (hasMid ? 1 : 0) + (hasOver ? 1 : 0));
  torso(v, hip, shMid, facing, squash, shirt, B, 1, false, anim, 0, TUCK[layers]);
  if (hasMid) {
    torso(v, hip, shMid, facing, squash, mid, B, hasOver ? 0.86 : 0.78, true, anim, 1.7,
      hasOver ? TUCK[1] : 1);
  }
  if (hasOver) torso(v, hip, shMid, facing, squash, over, B, 0.7, true, anim, 3.1, 1);
  headBlock(v, head, facing, squash, L, anim);
  if (hooded) strings(v, head, facing, squash, hooded, anim);

  // the board goes in here when it is being carried, so the near arm lands on
  // top of it and it reads as held rather than as floating in front of you
  if (deck && carrying) deck();

  // --- the near arm, over the top of it all ----------------------------------
  limb(v, nearArm.sh, nearArm.hand, UPPER, FORE, 3, sleeve1, cuffC1, elbowBend);
}

// --- pieces -------------------------------------------------------------------
// An outseam down the thigh and a crease at the knee. Two one-pixel lines, and
// they are the difference between a leg and a coloured bar.
function seam(v, hip, knee, foot, thick, col) {
  const o = Math.max(1, (thick - 1) / 2);
  const dx = knee[0] - hip[0], dy = knee[1] - hip[1];
  const m = Math.hypot(dx, dy) || 1;
  v.line(hip[0] - dy / m * o, hip[1] + dx / m * o, knee[0] - dy / m * o, knee[1] + dx / m * o, col);
  const dx2 = foot[0] - knee[0], dy2 = foot[1] - knee[1];
  const m2 = Math.hypot(dx2, dy2) || 1;
  v.line(knee[0] - dy2 / m2 * o, knee[1] + dx2 / m2 * o,
    knee[0] + dy2 / m2 * o, knee[1] - dx2 / m2 * o, col);
}

// `hem` is where the BOTTOM of this garment sits along the hip-to-shoulder
// line: 1 is the hip, 0.8 leaves a strip of whatever is underneath showing.
// `outer` means something else is already drawn below it.
// TUCK is how much a garment is squeezed by what is worn over it: nothing on
// top and it sits at its own size, one layer over it and it pulls in, two and
// it pulls in further. Without this a shirt under a jumper under a jacket comes
// out the same width as all three and the stack reads as one thick coat.
const TUCK = [1, 0.82, 0.68];

function torso(v, hip, sh, facing, squash, top, B, hem, outer, anim, phase, tuck) {
  const hemK = hem == null ? 1 : hem;
  const A = anim || { t: 0, wind: 0, stream: 1 };
  const ph = phase || 0;
  const kind = top.kind || 'none';
  const dx = sh[0] - hip[0], dy = sh[1] - hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  // how much room the garment takes up over what is under it
  const bulk = kind === 'puffer' ? 1.5 : kind === 'hoodie' ? 1.32
    : kind === 'vest' ? 1.26
      : kind === 'work' || kind === 'bomber' || kind === 'varsity' || kind === 'flannel' ? 1.2
        : kind === 'leather' || kind === 'coach' ? 1.18
          : kind === 'sweater' || kind === 'suit' || kind === 'cardigan' ? 1.14 : 1;
  const tuckIn = tuck == null ? 1 : tuck;
  const wTop = (3.6 * squash + 1.1) * bulk * B.shoulder * tuckIn;
  const wBot = (2.9 * squash + 1.0) * (bulk > 1 ? bulk * 1.12 : 1) * B.hip * tuckIn;
  const y0 = 1 - hemK;
  const at = (k, w) => [hip[0] + dx * k + px * w, hip[1] + dy * k + py * w];

  // THE HEM IS NOT A STRAIGHT LINE. It is a run of points that lift and drop on
  // a travelling wave, and the whole bottom of the garment leans away from the
  // direction you are going. A loose garment on a moving person is the cheapest
  // life you can put into a sprite -- and a dead straight hem is the tell that
  // there is none.
  //
  // How much it moves is set by how loose the garment is: a leather jacket
  // barely stirs, a hoodie is all over the place.
  const loose = top.kind === 'hoodie' || top.kind === 'flannel' || top.kind === 'cardigan' ? 1.25
    : top.kind === 'leather' || top.kind === 'vest' ? 0.35
      : top.kind === 'none' ? 1 : 0.7;
  const amp = 0.105 * loose * A.wind;
  const drift = 0.4 * loose * A.wind * A.stream;
  const N = 5;
  const wv = (u) => amp * Math.sin(A.t * 8.5 + ph + u * 3.1) + amp * 0.4;
  const hemAt = (u) => at(y0 - wv(u), wBot * (1 - 2 * u) + drift * u);

  const poly = [hemAt(0),
    [sh[0] + px * wTop, sh[1] + py * wTop],
    [sh[0] - px * wTop, sh[1] - py * wTop]];
  for (let i = N; i >= 0; i--) poly.push(hemAt(i / N));

  v.poly(expand(poly, 1.1), P.ink);
  v.poly(poly, top.c1);
  // the shaded far side: a quad between the far edge and the centre line, with
  // both of its bottom corners riding the same hem wave
  v.poly([
    hemAt(1),
    [sh[0] - px * wTop, sh[1] - py * wTop],
    [sh[0] - px * wTop * 0.3, sh[1] - py * wTop * 0.3],
    hemAt(0.65),
  ], top.c2);
  if (top.print && top.print !== 'none' && squash > 0.5) chestPrint(v, at, wTop, top);
  detail(v, at, kind, top, y0, wBot, wTop);
  if (top.stripes && kind === 'none') {
    band(v, at, 0.3, 0.4, wBot, top.c3);
    band(v, at, 0.56, 0.66, wBot, top.c3);
  }
  if (!outer) {
    // the fold at the hem, riding the same wave a hair above the edge
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const q = at(y0 - wv(u) + 0.07, wBot * 0.95 * (1 - 2 * u) + drift * u * 0.9);
      if (prev) v.line(prev[0], prev[1], q[0], q[1], top.c3);
      prev = q;
    }
  }
  void facing;
}

// What each garment has ON it. A hoodie has a pouch, a work jacket has chest
// pockets and a placket, a bomber has ribbing, a puffer has baffles.
function detail(v, at, kind, top, y0, wBot, wTop) {
  const zip = (a, b) => {
    const p1 = at(a, 0), p2 = at(b, 0);
    v.line(p1[0], p1[1], p2[0], p2[1], top.c3);
  };
  switch (kind) {
    case 'hoodie':
      v.polyLine([at(y0 + 0.1, wBot * 0.85), at(y0 + 0.3, wBot * 0.9),
        at(y0 + 0.3, -wBot * 0.9), at(y0 + 0.1, -wBot * 0.85)], top.c3, false);
      break;
    case 'sweater':
      band(v, at, y0 + 0.02, y0 + 0.11, wBot, top.c3);
      break;
    case 'cardigan':
      // open down the front, with a button band either side of the gap
      v.poly([at(y0 + 0.04, wBot * 0.2), at(0.9, wTop * 0.2),
        at(0.9, -wTop * 0.2), at(y0 + 0.04, -wBot * 0.2)], dark(top.c2, 0.78));
      band(v, at, y0 + 0.02, y0 + 0.1, wBot, top.c3);
      for (let i = 0; i < 4; i++) {
        const kk = y0 + 0.14 + i * 0.19;
        v.poly([at(kk, wBot * 0.3), at(kk + 0.03, wBot * 0.3),
          at(kk + 0.03, wBot * 0.18), at(kk, wBot * 0.18)], top.c3);
      }
      break;
    case 'vest':
      // an open gilet: two padded panels with a gap between them
      v.poly([at(y0 + 0.04, wBot * 0.22), at(0.88, wTop * 0.22),
        at(0.88, -wTop * 0.22), at(y0 + 0.04, -wBot * 0.22)], dark(top.c2, 0.72));
      for (let i = 1; i < 3; i++) band(v, at, y0 + i * 0.26, y0 + i * 0.26 + 0.04, wBot, top.c2);
      zip(y0 + 0.06, 0.88);
      break;
    case 'flannel':
      // a check: bands across, bands down, worn open over the shirt
      for (let i = 0; i < 5; i++) band(v, at, y0 + i * 0.19, y0 + i * 0.19 + 0.05, wBot, top.c2);
      for (const w of [0.62, 0.2, -0.2, -0.62]) {
        v.poly([at(y0 + 0.02, wBot * w), at(0.92, wTop * w),
          at(0.92, wTop * (w - 0.12)), at(y0 + 0.02, wBot * (w - 0.12))], top.c3);
      }
      zip(y0 + 0.05, 0.9);
      break;
    case 'leather':
      // a lapel each side and a zip set off centre
      v.poly([at(0.62, wTop * 0.9), at(0.92, wTop * 0.85),
        at(0.92, wTop * 0.2), at(0.62, wTop * 0.35)], top.c3);
      v.poly([at(0.62, -wTop * 0.2), at(0.92, -wTop * 0.85),
        at(0.92, -wTop * 0.9), at(0.62, -wTop * 0.35)], top.c3);
      band(v, at, y0 + 0.02, y0 + 0.09, wBot, top.c3);
      zip(y0 + 0.06, 0.62);
      break;
    case 'coach':
      // snaps up the front, and a band at the collar
      for (let i = 0; i < 5; i++) {
        const kk = y0 + 0.1 + i * 0.17;
        v.poly([at(kk, wBot * 0.08), at(kk + 0.025, wBot * 0.08),
          at(kk + 0.025, -wBot * 0.08), at(kk, -wBot * 0.08)], top.c3);
      }
      band(v, at, 0.87, 0.96, wTop, top.c3);
      break;
    case 'work':
      v.poly([at(0.5, wBot * 0.78), at(0.68, wBot * 0.78),
        at(0.68, wBot * 0.28), at(0.5, wBot * 0.28)], top.c3);
      v.poly([at(0.5, -wBot * 0.28), at(0.68, -wBot * 0.28),
        at(0.68, -wBot * 0.78), at(0.5, -wBot * 0.78)], top.c3);
      zip(y0 + 0.06, 0.92);
      break;
    case 'bomber':
    case 'varsity':
      band(v, at, y0 + 0.02, y0 + 0.13, wBot, top.c3);
      band(v, at, 0.86, 0.97, wTop, top.c3);
      zip(y0 + 0.12, 0.86);
      break;
    case 'puffer':
      for (let i = 1; i < 4; i++) band(v, at, y0 + i * 0.21, y0 + i * 0.21 + 0.04, wBot, top.c2);
      zip(y0 + 0.06, 0.92);
      break;
    case 'suit':
      zip(y0 + 0.05, 0.9);
      band(v, at, 0.42, 0.5, wBot, top.c3);   // the waist seam of a one-piece
      break;
    default: break;
  }
}

// A horizontal band of colour across the torso, in the same local coordinates
// the prints use, so ribbing and stripes follow the body as it turns.
function band(v, at, k0, k1, w, col) {
  v.poly([at(k0, w), at(k1, w), at(k1, -w), at(k0, -w)], col);
}

function chestPrint(v, at, w, top) {
  const ink = top.c3;
  const lit = P.ui1;
  const q = (a0, a1, r0, r1, col) =>
    v.poly([at(a0, w * r0), at(a1, w * r0), at(a1, w * r1), at(a0, w * r1)], col);
  switch (top.print) {
    case 'eye':
      q(0.48, 0.72, 0.62, -0.62, ink);
      q(0.53, 0.67, 0.42, -0.42, lit);
      q(0.57, 0.63, 0.16, -0.16, ink);
      break;
    case 'flame':
      q(0.42, 0.70, 0.5, -0.5, '#c22f36');
      q(0.46, 0.66, 0.32, -0.32, '#ff8a3d');
      q(0.52, 0.62, 0.14, -0.14, '#ffd23c');
      break;
    case 'star':
      q(0.46, 0.72, 0.16, -0.16, lit);
      q(0.55, 0.63, 0.55, -0.55, lit);
      break;
    case 'spiral':
      q(0.44, 0.74, 0.55, -0.55, ink);
      q(0.48, 0.70, 0.38, -0.38, lit);
      q(0.52, 0.66, 0.2, -0.2, ink);
      break;
    case 'skull':
      q(0.46, 0.72, 0.45, -0.45, '#efe8da');
      q(0.52, 0.58, 0.3, 0.1, ink);
      q(0.52, 0.58, -0.1, -0.3, ink);
      q(0.64, 0.7, 0.18, -0.18, ink);
      break;
    case 'bolt':
      q(0.42, 0.58, 0.3, 0.02, '#ffe36a');
      q(0.54, 0.72, -0.02, -0.3, '#ffe36a');
      break;
    default: break;
  }
}

// The hood is not welded to the shoulders -- it swings behind them, lifts when
// you are moving and settles when you stop.
function hood(v, head, sh, facing, squash, top, anim) {
  const A = anim || { t: 0, wind: 0, stream: 1 };
  const swing = Math.sin(A.t * 6.2) * 0.9 * A.wind;
  const lift = A.wind * 1.4;
  const cx = head[0] - facing * 2.2 * squash + A.stream * lift + swing;
  const cy = head[1] + 0.6 - lift * 0.8;
  v.poly(oval(cx, cy, 4.4 * squash + 1.4, 4.8), P.ink);
  v.poly(oval(cx, cy, 3.6 * squash + 1.2, 4.1), top.c2);
  v.poly(oval(cx - facing * 0.8 * squash, cy - 0.8, 2.4 * squash + 0.8, 2.8), top.c3);
  v.poly(oval(sh[0], sh[1] - 0.5, 4.0 * squash + 1.2, 2.2), P.ink);
  v.poly(oval(sh[0], sh[1] - 0.8, 3.3 * squash + 1.0, 1.7), top.c1);
}

// Two drawstrings, each on its own phase so they never swing as a pair, and
// each blown back along the way you are travelling. A pair of static lines down
// the chest is the thing that most makes a hoodie look printed on.
function strings(v, head, facing, squash, top, anim) {
  const A = anim || { t: 0, wind: 0, stream: 1 };
  const x = head[0] + facing * 1.2 * squash, y = head[1] + 3.2;
  const cord = (sx, len, ph) => {
    const swing = Math.sin(A.t * 7.4 + ph) * (0.5 + A.wind * 2.2);
    const blow = A.stream * A.wind * 2.2;
    // two segments, so it bends rather than pivoting like a stick
    const mx = sx + swing * 0.45 + blow * 0.4, my = y + len * 0.5;
    const ex = sx + swing + blow, ey = y + len;
    v.line(sx, y, mx, my, top.c3);
    v.line(mx, my, ex, ey, top.c3);
    v.rect(ex - 0.5, ey, 1, 1.4, top.c3);          // the aglet
  };
  cord(x, 4.2, 0);
  cord(x + facing * 1.6 * squash, 3.4, 2.1);
}

function headBlock(v, head, facing, squash, L, anim) {
  const A = anim || { t: 0, wind: 0, stream: 1 };
  const ry = 3.4;
  const rx = Math.max(1.6, 3.2 * squash);
  const cx = head[0], cy = head[1];
  const hat = L.hat, hair = L.hair;
  const covered = hat.kind === 'helmet' || hat.kind === 'bucket';

  if (!covered) backHair(v, cx, cy, rx, ry, facing, hair, A);

  v.poly(oval(cx, cy, rx + 1, ry + 1), P.ink);
  v.poly(oval(cx, cy, rx, ry), L.skin.c1);
  v.poly(oval(cx - facing * rx * 0.45, cy + 0.8, rx * 0.7, ry * 0.7), L.skin.c2);

  if (!covered) frontHair(v, cx, cy, rx, ry, facing, hair, hat.kind === 'none');

  if (hat.kind === 'beanie') {
    v.poly(oval(cx, cy - ry * 0.62, rx + 0.9, ry * 0.95), P.ink);
    v.poly(oval(cx, cy - ry * 0.66, rx + 0.4, ry * 0.85), hat.c1);
    v.poly(oval(cx, cy - ry * 1.15, rx * 0.6, ry * 0.4), hat.c1);
    v.rect(cx - rx - 0.6, cy - ry * 0.5, rx * 2 + 1.2, 1.8, hat.c2);
  } else if (hat.kind === 'bucket') {
    v.poly(oval(cx, cy - ry * 0.78, rx + 0.6, ry * 0.75), P.ink);
    v.poly(oval(cx, cy - ry * 0.8, rx + 0.2, ry * 0.66), hat.c1);
    v.rect(cx - rx - 2.6, cy - ry * 0.4, rx * 2 + 5.2, 1.8, P.ink);
    v.rect(cx - rx - 2.4, cy - ry * 0.4, rx * 2 + 4.8, 1.4, hat.c2);
  } else if (hat.kind === 'helmet') {
    v.poly(oval(cx, cy - ry * 0.5, rx + 1.5, ry * 1.15), P.ink);
    v.poly(oval(cx, cy - ry * 0.52, rx + 1.0, ry * 1.0), hat.c1);
    v.poly(oval(cx - facing * rx * 0.4, cy - ry * 0.85, rx * 0.6, ry * 0.4), hat.c2);
    v.rect(cx - rx * 0.5, cy - ry * 1.1, 1, 2, hat.c2);
    v.rect(cx + rx * 0.3, cy - ry * 1.1, 1, 2, hat.c2);
    v.line(cx - rx, cy + ry * 0.2, cx - facing * 0.5, cy + ry * 1.1, hat.c2);
  } else if (hat.kind === 'visor') {
    v.rect(cx - rx - 0.6, cy - ry * 0.75, rx * 2 + 1.2, 1.6, hat.c1);
    v.rect(cx + facing * rx * 0.2, cy - ry * 0.5, facing * (rx + 2.4), 1.4, hat.c2);
  } else if (hat.kind === 'cap') {
    const brim = hat.back ? -facing : facing;
    v.poly(oval(cx, cy - ry * 0.62, rx + 0.5, ry * 0.72), hat.c1);
    v.poly(oval(cx - facing * rx * 0.4, cy - ry * 0.62, rx * 0.55, ry * 0.5), hat.c2);
    v.rect(cx + brim * rx * 0.2, cy - ry * 0.45, brim * (rx + 2.2), 1.4, hat.c2);
  }

  glasses(v, cx, cy, rx, facing, squash, L.face, L.eyes || PLAIN.eyes);
}

// Frames get a bridge, an arm running back to the ear, and a glint on the lens.
// Without those three a pair of glasses is a black bar across the face.
function glasses(v, cx, cy, rx, facing, squash, face, eyes) {
  const k = face.kind;
  if (k === 'none') {
    // The bare eye: a dark rim with the iris colour inside it and a highlight.
    // Three pixels, but it is the only place eye colour can be seen at all.
    if (squash > 0.5) {
      const ex = cx + facing * rx * 0.24;
      v.rect(ex - facing * 0.6, cy - 0.7, 1, 2, P.ink);
      v.rect(ex + facing * 0.4, cy - 0.5, 1, 1.6, eyes.c1);
      v.rect(ex + facing * 0.4, cy + 0.3, 1, 0.9, eyes.c2);
    }
    return;
  }
  const eye = cy - 0.2;
  const w = rx * 1.9;
  const x0 = cx - rx * 0.95;

  if (k === 'shades') {
    v.rect(x0 - 1, eye - 1.6, w + 2, 3.2, P.ink);
    v.rect(x0, eye - 1.3, w, 2.6, face.c1);
    v.rect(x0, eye - 1.3, w, 0.9, face.c2);
    v.rect(cx + facing * rx * 0.15, eye - 0.8, 1, 1, '#ffffff');
    v.line(x0, eye - 1.0, cx - facing * rx * 1.35, eye - 0.1, face.c1);
  } else if (k === 'glasses') {
    v.rect(x0 - 1, eye - 1.8, w + 2, 3.6, P.ink);
    v.rect(x0, eye - 1.5, w, 3.0, face.c2);
    v.rect(x0 + 1, eye - 0.7, w - 2, 1.6, face.c1);
    v.rect(cx - 0.5, eye - 1.5, 1, 3.0, face.c2);
    v.rect(cx + facing * rx * 0.2, eye - 0.3, 1, 1, '#ffffff');
    v.line(x0, eye - 0.9, cx - facing * rx * 1.35, eye, face.c2);
  } else if (k === 'wire') {
    v.ring(cx - facing * rx * 0.55, eye, 2, face.c1);
    v.ring(cx + facing * rx * 0.55, eye, 2, face.c1);
    v.disc(cx - facing * rx * 0.55, eye, 1.2, face.c2);
    v.disc(cx + facing * rx * 0.55, eye, 1.2, face.c2);
    v.rect(cx - 1, eye - 0.5, 2, 1, face.c1);
    v.line(cx + facing * (rx * 0.55 + 2), eye, cx + facing * rx * 1.5, eye - 0.8, face.c1);
  } else if (k === 'blade') {
    v.poly([[x0 - 1, eye - 1.8], [x0 + w + 1, eye - 2.4],
      [x0 + w + 1, eye + 1.4], [x0 - 1, eye + 1.6]], P.ink);
    v.poly([[x0, eye - 1.4], [x0 + w, eye - 1.9], [x0 + w, eye + 1.0], [x0, eye + 1.2]], face.c1);
    v.poly([[x0 + 1, eye - 1.0], [x0 + w * 0.6, eye - 1.4],
      [x0 + w * 0.6, eye - 0.3], [x0 + 1, eye + 0.1]], face.c2);
  } else if (k === 'goggles') {
    v.rect(x0 - 1.6, eye - 2.2, w + 3.2, 4.4, P.ink);
    v.rect(x0 - 1, eye - 1.8, w + 2, 3.6, face.c1);
    v.rect(x0, eye - 1.2, w, 2.0, face.c2);
    v.rect(x0 + 1, eye - 1.0, w * 0.35, 1.0, '#ffffff');
    v.rect(cx - rx * 1.8, eye - 0.7, rx * 3.6, 1.2, P.ink3);
  }
}

// Long hair streams. The offset is applied to the CENTRE of each mass rather
// than to individual strands -- at this size a lock of hair is two pixels, so
// moving the whole shape is the only thing that reads.
function backHair(v, cx, cy, rx, ry, facing, hair, anim) {
  const A = anim || { t: 0, wind: 0, stream: 1 };
  // ONLY HAIR THAT HANGS STREAMS. Curls and an afro have no length to trail --
  // sliding the whole mass sideways turned them into a ponytail, which is a
  // different haircut. They get a small bounce in place instead, because a
  // round mass of hair does move, it just does not go anywhere.
  const hangs = hair.style === 'long' || hair.style === 'curlylong'
    || hair.style === 'pony' || hair.style === 'locs' || hair.style === 'braids';
  if (hangs) {
    cx += A.stream * A.wind * 2.6 + Math.sin(A.t * 5.6) * A.wind * 1.1;
    cy += -A.wind * 1.3;
  } else {
    cy += Math.sin(A.t * 6.4) * A.wind * 0.6;
    cx += Math.sin(A.t * 4.1) * A.wind * 0.4;
  }
  const back = -facing;
  switch (hair.style) {
    case 'long':
      v.poly(oval(cx + back * rx * 0.5, cy + 2.2, rx * 1.15, ry * 1.9), P.ink);
      v.poly(oval(cx + back * rx * 0.5, cy + 2.0, rx * 0.95, ry * 1.7), hair.c1);
      break;
    case 'curlylong':
      for (let i = 0; i < 6; i++) {
        const yy = cy - ry * 0.5 + i * 1.5;
        v.disc(cx + back * (rx * 0.7 + (i % 2) * 0.9), yy, 2.2, P.ink);
        v.disc(cx + back * (rx * 0.7 + (i % 2) * 0.9), yy, 1.6, i % 2 ? hair.c2 : hair.c1);
      }
      break;
    case 'pony':
      v.poly(oval(cx + back * (rx + 2.2), cy + 0.4, rx * 0.75, ry * 0.6), P.ink);
      v.poly(oval(cx + back * (rx + 2.0), cy + 0.4, rx * 0.6, ry * 0.45), hair.c1);
      v.poly(oval(cx + back * (rx + 3.6), cy + 2.4, rx * 0.5, ry * 0.6), hair.c2);
      break;
    case 'locs':
      for (let i = 0; i < 4; i++) {
        v.rect(cx + back * (rx * 0.2 + i * 1.3) - 1, cy - ry * 0.2, 2, ry * 2.0 + 1, P.ink);
        v.rect(cx + back * (rx * 0.2 + i * 1.3) - 0.5, cy - ry * 0.2, 1.4, ry * 2.0, hair.c1);
      }
      break;
    case 'braids':
      for (let i = 0; i < 4; i++) {
        const yy = cy - ry * 0.9 + i * 1.4;
        v.line(cx + facing * rx * 0.5, yy, cx + back * (rx + 1.6), yy + 1.2, hair.c1);
        v.line(cx + facing * rx * 0.5, yy + 0.6, cx + back * (rx + 1.6), yy + 1.8, hair.c2);
      }
      break;
    case 'curls':
    case 'afro':
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.12 + i * 0.19);
        v.disc(cx + Math.cos(a) * back * rx * 1.15, cy - Math.sin(a) * ry * 1.15, 2.2, hair.c2);
      }
      break;
    case 'bun':
      v.disc(cx + back * rx * 0.4, cy - ry * 1.5, 2.4, P.ink);
      v.disc(cx + back * rx * 0.4, cy - ry * 1.5, 1.8, hair.c1);
      break;
    default: break;
  }
}

function frontHair(v, cx, cy, rx, ry, facing, hair, bare) {
  switch (hair.style) {
    case 'bald':
      return;
    case 'buzz':
      v.poly(oval(cx, cy - ry * 0.6, rx + 0.2, ry * 0.62), hair.c1);
      return;
    case 'waves':
      v.poly(oval(cx, cy - ry * 0.6, rx + 0.3, ry * 0.66), hair.c1);
      for (let i = 0; i < 3; i++) {
        v.line(cx - rx + i * rx * 0.7, cy - ry * 1.0,
          cx - rx * 0.6 + i * rx * 0.7, cy - ry * 0.5, hair.c2);
      }
      return;
    case 'afro':
      v.poly(oval(cx, cy - ry * 0.75, rx + 2.3, ry * 1.25), P.ink);
      v.poly(oval(cx, cy - ry * 0.78, rx + 1.9, ry * 1.1), hair.c1);
      for (let i = 0; i < 4; i++) {
        v.disc(cx - rx + i * rx * 0.7, cy - ry * (1.05 + (i % 2) * 0.28), 1.4, hair.c2);
      }
      return;
    case 'curls':
    case 'curlylong':
      v.poly(oval(cx, cy - ry * 0.62, rx + 1.2, ry * 0.95), hair.c1);
      v.disc(cx - facing * rx * 0.55, cy - ry * 1.15, 1.9, hair.c2);
      v.disc(cx + facing * rx * 0.35, cy - ry * 1.05, 1.7, hair.c1);
      v.disc(cx + facing * rx * 0.95, cy - ry * 0.5, 1.3, hair.c2);
      return;
    case 'locs':
    case 'braids':
      v.poly(oval(cx, cy - ry * 0.7, rx + 0.5, ry * 0.7), hair.c1);
      return;
    default:
      v.poly(oval(cx, cy - ry * 0.6, rx + 0.5, ry * (bare ? 0.8 : 0.62)), hair.c1);
      v.poly(oval(cx - facing * rx * 0.35, cy - ry * 0.75, rx * 0.6, ry * 0.45), hair.c2);
      v.rect(cx + facing * rx * 0.1, cy - ry * 0.35, facing * rx * 0.95, 1.2, hair.c1);
      return;
  }
}

// Baggy denim stacking over the shoe. `amount` comes from the fit.
function cuff(v, foot, ang, facing, squash, thick, amount, col, anim, phase) {
  const A = anim || { t: 0, wind: 0, stream: 1 };
  const flick = Math.sin(A.t * 8.8 + (phase || 0)) * A.wind * 1.1;
  const c = Math.cos(ang), s = Math.sin(ang);
  const w = (thick * 0.46 + 0.9) * squash + 0.4;
  const q = (dx, dy) => [foot[0] + c * dx + s * dy, foot[1] + s * dx - c * dy];
  const top = 2.2 + 3.2 * amount;
  const quad = [q(-w * facing, 1.9), q(w * facing * 1.12, 1.9),
    q(w * facing * 1.12 + flick, top), q(-w * facing + flick * 0.6, top)];
  v.poly(expand(quad, 1), P.ink);
  v.poly(quad, col);
  const fy = 1.9 + (top - 1.9) * 0.45;
  v.line(q(-w * facing, fy)[0], q(-w * facing, fy)[1],
    q(w * facing * 1.12, fy)[0], q(w * facing * 1.12, fy)[1], P.ink3);
}

function hem(v, knee, foot, amount, thick, squash, col) {
  const dx = foot[0] - knee[0], dy = foot[1] - knee[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const w = (thick * 0.46 + 0.9) * squash + 0.5;
  const drop = len * Math.max(0.25, amount - 0.12);
  const quad = [
    [knee[0] - px * w * 0.8, knee[1] - py * w * 0.8],
    [knee[0] + px * w * 0.8, knee[1] + py * w * 0.8],
    [knee[0] + ux * drop + px * w, knee[1] + uy * drop + py * w],
    [knee[0] + ux * drop - px * w, knee[1] + uy * drop - py * w],
  ];
  v.poly(expand(quad, 1), P.ink);
  v.poly(quad, col);
}

// A sock is a cuff of fabric at the ankle. It is SMALL -- sized off the leg,
// never off the shoe, or it swallows both.
function sock(v, foot, ang, facing, squash, socks, legThick, far) {
  if (!socks || socks.kind === 'none') return;
  const c = Math.cos(ang), s = Math.sin(ang);
  const h = socks.kind === 'tall' ? 3.2 : 1.6;
  const w = (legThick * 0.34) * squash + 0.35;
  const q = (dx, dy) => [foot[0] + c * dx + s * dy, foot[1] + s * dx - c * dy];
  const quad = [q(-w * facing, 1.5), q(w * facing, 1.5),
    q(w * facing, 1.5 + h), q(-w * facing, 1.5 + h)];
  v.poly(expand(quad, 0.7), P.ink);
  v.poly(quad, far ? dark(socks.c1, 0.7) : socks.c1);
  if (socks.stripe && h > 2.4) {
    v.poly([q(-w * facing, 1.5 + h * 0.5), q(w * facing, 1.5 + h * 0.5),
      q(w * facing, 1.5 + h * 0.8), q(-w * facing, 1.5 + h * 0.8)], socks.c2);
  }
}

function shoe(v, foot, ang, facing, squash, far, sh, skin) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const chunk = sh.chunky ? 1.25 : 1;
  // Shoes were reading as boots on everybody. A skate shoe is bulky, but it is
  // not a third of the rider's height.
  const back = (1.6 * squash + 0.4) * chunk, fwd = (2.1 * squash + 0.5) * chunk;
  const q = (dx, dy) => [foot[0] + c * dx + s * dy, foot[1] + s * dx - c * dy];

  if (sh.bare) {
    const quad = [q(-back * 0.8 * facing, 0), q(fwd * 0.9 * facing, 0),
      q(fwd * 0.9 * facing, 1.7), q(-back * 0.8 * facing, 1.7)];
    v.poly(expand(quad, 1), P.ink);
    v.poly(quad, far ? skin.c2 : skin.c1);
    return;
  }
  if (sh.flip) {
    const quad = [q(-back * facing, 0), q(fwd * facing, 0),
      q(fwd * facing, 1.1), q(-back * facing, 1.1)];
    v.poly(expand(quad, 1), P.ink);
    v.poly(quad, sh.sole);
    v.line(q(fwd * facing * 0.6, 1.1)[0], q(fwd * facing * 0.6, 1.1)[1],
      q(0, 2.6)[0], q(0, 2.6)[1], far ? sh.c2 : sh.c1);
    v.poly([q(-back * 0.7 * facing, 1.1), q(fwd * 0.7 * facing, 1.1),
      q(fwd * 0.7 * facing, 2.4), q(-back * 0.7 * facing, 2.4)], far ? skin.c2 : skin.c1);
    return;
  }

  const h = (sh.hi ? 2.4 : 1.7) * (sh.chunky ? 1.15 : 1);
  const quad = [q(-back * facing, 0), q(fwd * facing, 0), q(fwd * facing, h), q(-back * facing, h)];
  v.poly(expand(quad, 1), P.ink);
  v.poly(quad, far ? sh.c2 : sh.c1);
  if (sh.checker && squash > 0.45) {
    for (let i = 0; i < 4; i += 2) {
      const a = -back + (back + fwd) * (i / 4), b2 = -back + (back + fwd) * ((i + 1) / 4);
      v.poly([q(a * facing, h * 0.3), q(b2 * facing, h * 0.3),
        q(b2 * facing, h), q(a * facing, h)], far ? '#8e8a80' : sh.sole);
    }
  }
  v.line(quad[0][0], quad[0][1], quad[1][0], quad[1][1], far ? '#b8b2a4' : sh.sole);
  if (sh.chunky) v.line(quad[3][0], quad[3][1], quad[2][0], quad[2][1], far ? sh.c2 : sh.sole);
}

// Two-bone IK drawn as thick pixel lines. Returns the mid joint.
function limb(v, a, b, l1, l2, thick, col, col2, bend, thick2) {
  const t2 = thick2 || thick;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.99;
  let tx = b[0], ty = b[1];
  if (d > maxD) { const k = maxD / d; tx = a[0] + dx * k; ty = a[1] + dy * k; d = maxD; }
  if (d < 0.001) d = 0.001;
  const ux = (tx - a[0]) / d, uy = (ty - a[1]) / d;
  const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
  const mx = a[0] + ux * aa - uy * hh * bend;
  const my = a[1] + uy * aa + ux * hh * bend;

  // A 2px leg inside a 2px outline is all outline, so thin limbs get a thin one.
  v.line(a[0], a[1], mx, my, P.ink, thick + (thick > 2 ? 2 : 1));
  v.line(mx, my, tx, ty, P.ink, t2 + (t2 > 2 ? 2 : 1));
  v.line(a[0], a[1], mx, my, col, thick);
  v.line(mx, my, tx, ty, col2, t2);
  return [mx, my];
}

function clamp(a, lo, hi) { return a < lo ? lo : a > hi ? hi : a; }
function lerp1(a, b, k) { return a + (b - a) * k; }

function dark(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function oval(cx, cy, rx, ry) {
  const pts = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function expand(quad, by) {
  let cx = 0, cy = 0;
  for (const q of quad) { cx += q[0]; cy += q[1]; }
  cx /= quad.length; cy /= quad.length;
  return quad.map((q) => {
    const dx = q[0] - cx, dy = q[1] - cy;
    const m = Math.hypot(dx, dy) || 1;
    return [q[0] + dx / m * by, q[1] + dy / m * by];
  });
}

export { PLAIN as DEFAULT_LOOK };
