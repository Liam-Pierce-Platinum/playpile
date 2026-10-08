// The boxer is a posed rig, the same idea as Grind City's skater: a skeleton
// of a dozen joints, keyframed, interpolated, and drawn as thick pixel limbs
// with a plum-black ink outline. Animation is a function of the fighter's
// STATE and how long it has been in it - nothing is stored between frames -
// which is what lets the online guest draw the host's fight from a snapshot.
//
// Local space: facing right, y UP, origin on the canvas between the feet.
// Joints: fL/fR feet, kL/kR knees, hip, neck, head (centre), eF/gF the front
// (lead) elbow and glove, eB/gB the back (rear) elbow and glove. `tw` twists
// the shoulders: +1 turns the rear shoulder through, which is a cross.
//
// DRAW ORDER: rear arm, rear leg, lead leg, trunks, torso, head, lead arm. The
// lead arm is nearest the camera; everything a rear-hand punch does still
// shows because the rear glove travels out past the chest.


import { renderFigure, blitFigure, toScreen } from './figure.js';

const KEYS = ['fL', 'fR', 'kL', 'kR', 'hip', 'neck', 'head', 'eF', 'gF', 'eB', 'gB'];

const GUARD = {
  fL: [8, 0], fR: [-8, 0], kL: [8, 11], kR: [-5, 11], hip: [0, 21], neck: [2, 36], head: [4, 42],
  eF: [8, 28], gF: [13, 37], eB: [3, 28], gB: [8, 40], tw: 0,
};
const clone = (p) => { const o = { tw: p.tw || 0 }; for (const k of KEYS) o[k] = [p[k][0], p[k][1]]; return o; };
const from = (base, o) => { const p = clone(base); for (const k in o) p[k] = Array.isArray(o[k]) ? [o[k][0], o[k][1]] : o[k]; return p; };

export const POSE = {
  guard: GUARD,
  relaxed: from(GUARD, { gF: [11, 31], eF: [7, 25], gB: [6, 32], eB: [2, 25], head: [3, 42] }),
  open: from(GUARD, { gF: [12, 26], eF: [8, 24], gB: [6, 25], eB: [2, 24], head: [4, 43], neck: [2, 37] }),
  blockHi: from(GUARD, { gF: [10, 43], eF: [9, 32], gB: [7, 42], eB: [5, 31], head: [3, 40], neck: [2, 35] }),
  blockLo: from(GUARD, { gF: [11, 30], eF: [7, 26], gB: [7, 29], eB: [3, 25], hip: [0, 20], kL: [8, 10], kR: [-5, 10], head: [5, 41], neck: [3, 35] }),
  slip: from(GUARD, { hip: [-1, 20], neck: [-4, 34], head: [-6, 39], gF: [6, 36], eF: [3, 28], gB: [1, 37], eB: [-2, 28], kL: [7, 11], kR: [-7, 9], fR: [-10, 0], tw: -0.2 }),
  duck: from(GUARD, { hip: [0, 15], neck: [6, 27], head: [9, 31], gF: [14, 31], eF: [10, 23], gB: [11, 30], eB: [6, 22], kL: [10, 8], kR: [-6, 7], tw: 0.1 }),
  hitHead: from(GUARD, { hip: [-2, 21], neck: [-2, 35], head: [-5, 40], gF: [9, 30], eF: [5, 26], gB: [2, 31], eB: [-1, 27], kR: [-6, 11], tw: -0.4 }),
  hitBody: from(GUARD, { hip: [-2, 19], neck: [5, 30], head: [8, 35], gF: [9, 25], eF: [6, 23], gB: [6, 24], eB: [2, 22], kL: [9, 9], kR: [-5, 9], tw: 0.2 }),
  stagger: from(GUARD, { hip: [-1, 20], neck: [0, 34], head: [1, 39], gF: [11, 25], eF: [6, 24], gB: [4, 24], eB: [0, 24], kL: [9, 10], kR: [-4, 10] }),
  taunt: from(GUARD, { neck: [4, 37], head: [8, 43], gF: [16, 22], eF: [10, 27], gB: [-9, 23], eB: [-5, 28], tw: 0.3 }),
  win: from(GUARD, { neck: [1, 37], head: [2, 43], gF: [9, 56], eF: [7, 47], gB: [-3, 56], eB: [-3, 47], fL: [6, 0], fR: [-6, 0], kL: [6, 11], kR: [-5, 11] }),
  lose: from(GUARD, { neck: [3, 35], head: [6, 39], gF: [7, 21], eF: [5, 27], gB: [2, 21], eB: [0, 27], fL: [5, 0], fR: [-5, 0], kL: [5, 11], kR: [-4, 11] }),
  fall: from(GUARD, { fL: [10, 0], fR: [2, 0], kL: [10, 8], kR: [2, 7], hip: [-5, 11], neck: [-15, 21], head: [-18, 25], eF: [-6, 27], gF: [0, 33], eB: [-17, 15], gB: [-14, 9], tw: -0.6 }),
  down: from(GUARD, { fL: [18, 2], fR: [15, 1], kL: [11, 6], kR: [8, 5], hip: [0, 3], neck: [-15, 3], head: [-20, 4], eF: [-10, 9], gF: [-15, 12], eB: [-9, 1], gB: [-3, 1], tw: 0 }),
  kneel: from(GUARD, { fL: [9, 0], kL: [10, 9], kR: [-3, 2], fR: [-11, 1], hip: [-1, 12], neck: [3, 27], head: [5, 33], eF: [7, 19], gF: [11, 12], eB: [2, 19], gB: [3, 13], tw: 0 }),
};

// ---- the punches. For each kind: a wind-up pose and an extended pose. The
// body version of a punch is the head version with a LEVEL CHANGE: the hips
// drop, the knees bend and the glove lands about 12px lower.
function punchPoses(kind, hand, target) {
  const F = hand === 'lead';
  const g = F ? 'gF' : 'gB', e = F ? 'eF' : 'eB';
  let wind, ext;
  switch (kind) {
    case 'straight':
      wind = F ? from(GUARD, { gF: [11, 36], eF: [6, 29] }) : from(GUARD, { gB: [6, 39], eB: [1, 29], tw: -0.3, hip: [-1, 21] });
      ext = F
        ? from(GUARD, { gF: [31, 39], eF: [21, 38], neck: [4, 36], head: [6, 42], fL: [10, 0], tw: 0.25, gB: [8, 41] })
        : from(GUARD, { gB: [31, 39], eB: [20, 38], neck: [6, 35], head: [8, 41], hip: [2, 21], fR: [-6, 1], tw: 1, gF: [9, 41], eF: [6, 31] });
      break;
    case 'hook':
      wind = F ? from(GUARD, { eF: [6, 30], gF: [8, 34], tw: -0.5 }) : from(GUARD, { eB: [-1, 31], gB: [1, 36], tw: -0.4 });
      ext = F
        ? from(GUARD, { eF: [15, 37], gF: [22, 39], neck: [5, 35], head: [7, 41], tw: 0.7, gB: [9, 41] })
        : from(GUARD, { eB: [15, 38], gB: [22, 40], neck: [6, 35], head: [8, 41], tw: 1.3, fR: [-6, 1], gF: [9, 41], eF: [6, 31] });
      break;
    case 'upper':
      wind = from(GUARD, { hip: [0, 17], neck: [3, 31], head: [5, 37], kL: [9, 9], kR: [-5, 9], [g]: F ? [9, 24] : [5, 24], [e]: F ? [5, 26] : [1, 27], tw: -0.3 });
      ext = from(GUARD, { hip: [1, 22], neck: [5, 37], head: [6, 43], [g]: [18, 46], [e]: [13, 34], tw: F ? 0.4 : 0.9, fR: [-7, 1] });
      if (!F) { ext.gF = [9, 41]; ext.eF = [6, 31]; }
      break;
    case 'over':
      wind = from(GUARD, { gB: [-3, 47], eB: [-4, 38], tw: -0.6, neck: [0, 37], head: [2, 43] });
      ext = from(GUARD, { gB: [28, 36], eB: [18, 43], neck: [8, 33], head: [10, 39], hip: [2, 20], tw: 1.3, fR: [-5, 1], gF: [9, 36], eF: [6, 28] });
      break;
    case 'star':
      wind = from(GUARD, { gB: [-12, 37], eB: [-6, 32], tw: -1, hip: [-3, 19], neck: [-3, 33], head: [-1, 39], kR: [-7, 9], gF: [12, 40] });
      ext = from(GUARD, { gB: [35, 40], eB: [23, 39], neck: [8, 35], head: [10, 41], hip: [5, 20], fL: [14, 0], kL: [13, 10], fR: [-4, 1], tw: 1.4, gF: [10, 41], eF: [7, 31] });
      break;
  }
  // a body shot aims the glove at the belly. The LEVEL CHANGE (hips down, knees
  // bent) is the crouch, applied in animate() on top of every pose.
  if (target === 'body') {
    ext[g][1] = kind === 'upper' ? 40 : 33; ext[e][1] = kind === 'upper' ? 30 : 33;
    if (kind === 'hook') ext[e][1] = 34;
  }
  return { wind, ext };
}

const lerp = (a, b, t) => a + (b - a) * t;
function blend(A, B, t) {
  const o = { tw: lerp(A.tw || 0, B.tw || 0, t) };
  for (const k of KEYS) o[k] = [lerp(A[k][0], B[k][0], t), lerp(A[k][1], B[k][1], t)];
  return o;
}
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const cl = (t) => Math.max(0, Math.min(1, t));

// The pose for a fighter right now. `now` is a clock for idle bounce.
export function animate(f, now, phase) {
  let p;
  const t = f.t || 0;
  const inFight = phase === 'fight' || phase === 'resume' || phase === undefined;
  const base = !inFight ? POSE.relaxed : f.open > 0 ? POSE.open : f.guard === 1 ? POSE.blockHi : f.guard === 2 ? POSE.blockLo : POSE.guard;
  let bounce = true, walk = true;
  switch (f.state) {
    case 'punch': {
      const A = f.act;
      if (!A) { p = clone(base); break; }
      const { wind, ext } = punchPoses(A.kind, A.hand, A.target);
      const T = A.t, s = A.start;
      const reachOut = Math.min(s, A.kind === 'straight' && A.hand === 'lead' ? 0.06 : 0.09);
      if (A.hit === 'miss' || A.hit === 'dodge') { const g = A.hand === 'lead' ? 'gF' : 'gB'; ext[g][0] += 3; ext.neck[0] += 2; ext.head[0] += 2; }
      if (A.hit === 'block') { const g = A.hand === 'lead' ? 'gF' : 'gB'; ext[g][0] -= 3; }
      if (T < s - reachOut) p = blend(POSE.guard, wind, easeOut(cl(T / Math.max(0.01, s - reachOut))));
      else if (T < s) p = blend(wind, ext, easeIn(cl((T - (s - reachOut)) / reachOut)));
      else if (T < s + A.active) p = ext;
      else p = blend(ext, base, easeIO(cl((T - s - A.active) / A.rec)));
      // a telegraphed haymaker shakes while it winds
      if (A.tell && T < s - reachOut) { const j = Math.sin(now * 70) * 0.8; for (const k of KEYS) p[k][0] += j; }
      bounce = false;
      break;
    }
    case 'dodge': {
      const D = f.dodge === 'duck' ? POSE.duck : POSE.slip;
      const len = f.st ? f.st.dodgeLen : 0.42;
      if (t < 0.07) p = blend(base, D, easeOut(t / 0.07));
      else if (t < len - 0.12) p = D;
      else p = blend(D, base, easeIO(cl((t - (len - 0.12)) / 0.12)));
      bounce = false;
      break;
    }
    case 'hit': {
      const H = f.hitTarget === 'body' ? POSE.hitBody : POSE.hitHead;
      const stun = f.stun || 0.2;
      if (t < 0.04) p = blend(base, H, t / 0.04);
      else p = blend(H, base, easeIO(cl((t - 0.04) / Math.max(0.05, stun - 0.04))));
      bounce = false;
      break;
    }
    case 'stagger': {
      p = clone(POSE.stagger);
      const sw = Math.sin(t * 9) * 3, sw2 = Math.sin(t * 9 + 1.2) * 2;
      p.neck[0] += sw; p.head[0] += sw * 1.4; p.head[1] += Math.abs(sw2) * 0.3 - 1;
      p.gF[0] += sw2; p.gB[0] += sw2; p.eF[0] += sw2 * 0.5; p.eB[0] += sw2 * 0.5;
      p.hip[0] += sw * 0.3;
      if (t < 0.06) p = blend(f.hitTarget === 'body' ? POSE.hitBody : POSE.hitHead, p, t / 0.06);
      bounce = false;
      break;
    }
    case 'taunt': {
      p = clone(POSE.taunt);
      const sh = Math.sin(t * 16) * 1.5;
      p.head[0] += sh; p.gF[1] += Math.sin(t * 8) * 2; p.gB[1] += Math.sin(t * 8 + 3) * 2;
      if (t < 0.12) p = blend(base, p, t / 0.12);
      if (t > 1.0) p = blend(p, base, cl((t - 1.0) / 0.15));
      bounce = false;
      break;
    }
    case 'down': case 'ko': {
      if (t < 0.32) p = blend(POSE.hitHead, POSE.fall, easeIn(t / 0.32));
      else if (t < 0.5) {
        p = blend(POSE.fall, POSE.down, easeIn(cl((t - 0.32) / 0.12)));
      } else {
        p = clone(POSE.down);
        // the bounce off the canvas, then a twitch or two
        const b = t < 0.75 ? Math.sin((t - 0.5) / 0.25 * Math.PI) * 3 : 0;
        for (const k of KEYS) p[k][1] += b * (k === 'hip' ? 1 : 0.7);
        if (f.state === 'down') { p.gF[1] += Math.max(0, Math.sin(t * 2.2)) * 2; p.head[1] += Math.max(0, Math.sin(t * 1.7)) * 1.2; }
      }
      bounce = false; walk = false;
      break;
    }
    case 'getup': {
      if (t < 0.45) p = blend(POSE.down, POSE.kneel, easeIO(t / 0.45));
      else if (t < 0.6) p = POSE.kneel;
      else p = blend(POSE.kneel, POSE.guard, easeIO(cl((t - 0.6) / 0.4)));
      bounce = false; walk = false;
      break;
    }
    case 'win': {
      p = clone(POSE.win);
      const hop = Math.abs(Math.sin(t * 7)) * 3;
      for (const k of KEYS) if (k !== 'fL' && k !== 'fR') p[k][1] += hop * (k[0] === 'k' ? 0.5 : 1);
      p.fL[1] += hop * 0.8; p.fR[1] += hop * 0.8;
      p.gF[0] += Math.sin(t * 7) * 1.5; p.gB[0] -= Math.sin(t * 7) * 1.5;
      if (t < 0.25) p = blend(POSE.guard, p, t / 0.25);
      bounce = false; walk = false;
      break;
    }
    case 'lose': {
      p = blend(base, POSE.lose, cl(t / 0.6));
      bounce = false;
      break;
    }
    default:
      p = clone(base);
  }
  if (p === base || Object.isFrozen(p)) p = clone(p);
  if (!p.fL) p = clone(GUARD);
  p = clone(p);

  // the crouch: knees bend, hips sink, head and hands come down and forward
  const standing = f.state !== 'down' && f.state !== 'ko' && f.state !== 'getup' && f.state !== 'win' && f.state !== 'lose' && f.state !== 'taunt';
  const c = standing ? (f.crouch || 0) : 0;
  if (c > 0.01) {
    p.hip[1] -= 5 * c;
    p.neck[0] += 2 * c; p.neck[1] -= 7 * c;
    p.head[0] += 2 * c; p.head[1] -= 7 * c;
    for (const k of ['eF', 'gF', 'eB', 'gB']) { p[k][1] -= 6 * c; p[k][0] += 1 * c; }
    p.kL[0] += 1.5 * c; p.kL[1] -= 3 * c; p.kR[0] -= 1 * c; p.kR[1] -= 3 * c;
    p.fL[0] += 2 * c; p.fR[0] -= 2 * c;
  }

  // footwork: a boxer's shuffle, feet sliding and lifting, never crossing
  const sp = f.speedNow || 0;
  if (walk && sp > 6 && f.state !== 'down') {
    const ph = f.walk || 0, a = Math.min(1, sp / 50);
    const s1 = Math.sin(ph * 2.2), c1 = Math.cos(ph * 2.2);
    p.fL[0] += s1 * 3 * a; p.fL[1] += Math.max(0, c1) * 1.6 * a;
    p.fR[0] -= s1 * 3 * a; p.fR[1] += Math.max(0, -c1) * 1.6 * a;
    p.kL[0] += s1 * 1.5 * a; p.kR[0] -= s1 * 1.5 * a;
    const b = Math.abs(c1) * 0.8 * a;
    for (const k of ['hip', 'neck', 'head', 'eF', 'gF', 'eB', 'gB']) p[k][1] += b;
  }
  // and the bounce on the toes when standing
  if (bounce && f.state !== 'down') {
    const b = inFight ? (Math.sin(now * 7.5 + f.side * 2) * 0.5 + 0.5) * 1.3 : Math.sin(now * 2) * 0.5;
    for (const k of ['hip', 'neck', 'head', 'eF', 'gF', 'eB', 'gB']) p[k][1] += b;
    p.kL[1] += b * 0.5; p.kR[1] += b * 0.5;
    // breathing: gloves drift
    p.gF[1] += Math.sin(now * 3.1 + f.side) * 0.5;
    p.gB[0] += Math.sin(now * 2.7 + f.side) * 0.4;
  }
  return p;
}

// ------------------------------------------------------------------ draw ---
// ------------------------------------------------------------------ draw ---
// Animation is stepped into FRAMES (20 a second for moves, 10 for the idle
// bounce) like a hand-drawn sprite, while the fighter still slides smoothly
// across the ring. The figure itself is rasterised by figure.js.
const FPS = 20;
const q = (t, fps) => Math.floor((t || 0) * fps) / fps;

export function framed(f) {
  const g = Object.assign({}, f, { t: q(f.t, FPS), hitT: q(f.hitT, FPS), walk: q(f.walk, 6) });
  if (f.act) g.act = Object.assign({}, f.act, { t: q(f.act.t, FPS) });
  return g;
}

export function drawBoxer(v, f, X, Y, now, opts = {}) {
  const pose = opts.pose || animate(framed(f), q(now, 10), opts.phase);
  const r = renderFigure(f.look, pose, { flash: f.flash > 0, rim: opts.rim, state: f.state, hitT: f.hitT });
  const face = f.face || 1;
  Y -= pose.lift || 0;             // thrown, lifted, flying
  blitFigure(v, X, Y, face);
  return { head: toScreen(r.head, X, Y, face), gF: toScreen(r.gF, X, Y, face), gB: toScreen(r.gB, X, Y, face), hip: toScreen(r.hip, X, Y, face) };
}

// ------------------------------------------------------------- the ref ---
const REF_LOOK = { skin: 1, hair: 'short', hairC: '#9a9aa4', beard: 'stache', beardC: '#9a9aa4', outfit: 'ref', shoes: '#141018', build: { w: 1, h: 1 } };
const REF_WRESTLE = { skin: 3, hair: 'buzz', hairC: '#1a120e', beard: 'none', outfit: 'ref', shirt: '#e8e6dc', pants: '#1a1a22', shoes: '#141018', build: { w: 1, h: 1 } };
const GYOJI = { skin: 1, hair: 'eboshi', hairC: '#2a1a10', beard: 'none', outfit: 'ref', shirt: '#7a2a8a', pants: '#5a1a6a', shoes: '#f2f2f2', build: { w: 1.05, h: 1 } };
export function refPose(R, fight) {
  const pose = clone(POSE.relaxed);
  pose.gF = [9, 26]; pose.eF = [6, 28]; pose.gB = [-4, 24]; pose.eB = [-2, 28];
  const face = R.face || 1;
  if (R.mode === 'pin') {
    // down on the mat beside them, slapping the count
    const ph = Math.min(1, (R.countT || 0) / 0.25);
    const p2 = clone(POSE.kneel); p2.neck = [8, 22]; p2.head = [12, 25]; p2.hip = [0, 11];
    p2.eF = [12, 16]; p2.gF = [16, 18 - ph * 16]; p2.eB = [6, 14]; p2.gB = [10, 4];
    return p2;
  }
  if (R.mode === 'gyoji') {
    // holding the war fan (gunbai) out over the ring
    pose.eF = [9, 34]; pose.gF = [15, 36]; pose.neck = [3, 36]; pose.head = [5, 42];
    if (fight && fight.phase === 'intro' && !fight.called) { pose.gF = [14, 30]; }
    if (fight && fight.called && fight.phase === 'intro') { pose.eF = [6, 46]; pose.gF = [9, 56]; }
  }
  if (R.mode === 'count' && R.count > 0) {
    // the arm drops with each number
    const ph = Math.min(1, (R.countT || 0) / 0.35);
    pose.neck = [5, 33]; pose.head = [8, 38]; pose.hip = [0, 19];
    pose.eF = [10, 36]; pose.gF = [14 + ph * 2, 46 - ph * 18];
    pose.kL = [8, 9];
  }
  if (R.raise >= 0 && fight && fight.result) {
    const W = fight.f[R.raise];
    const towards = Math.sign(W.x - R.x) === face;
    pose.eF = [7, 47]; pose.gF = [10, 58];
    if (!towards) { pose.eB = [-5, 47]; pose.gB = [-7, 58]; }
  }
  const w = q(R.walk || 0, 6);
  pose.fL[0] += Math.sin(w) * 2; pose.fR[0] -= Math.sin(w) * 2;
  return pose;
}
export function drawRef(v, R, X, Y, now, fight, rim) {
  const look = fight && fight.kind === 'wrestle' ? REF_WRESTLE : fight && fight.kind === 'sumo' ? GYOJI : REF_LOOK;
  const r = renderFigure(look, refPose(R, fight), { rim });
  blitFigure(v, X, Y, R.face || 1);
  return { head: toScreen(r.head, X, Y, R.face || 1), hand: toScreen(r.gF, X, Y, R.face || 1) };
}

// shared with the wrestling and sumo animators
export { clone, from, blend, easeOut, easeIn, easeIO, cl, KEYS };
// rotate a whole pose about a point (local units), for throws and falls
export function rotatePose(p, ang, px = 0, py = 20) {
  const c = Math.cos(ang), s = Math.sin(ang), o = clone(p);
  for (const k of KEYS) { const x = p[k][0] - px, y = p[k][1] - py; o[k] = [px + x * c - y * s, py + x * s + y * c]; }
  o.tw = p.tw; o.lift = p.lift;
  return o;
}
