// Procedural animation. No keyframes and no clips -- every pose is computed
// from the current state, which is how a lot of N64-era motion was blended
// anyway, and it means a new character animates the moment it exists.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/* ---------------- attack poses ----------------
 * Arm rotation convention: a limb hangs down -Y from its pivot, so a NEGATIVE
 * rotation.x swings it FORWARD. -1.57 is straight out in front.
 */

const REST_POSE = {
  shXR: -0.15, shZR: -0.10, elXR: -0.45,
  shXL: -0.15, shZL: 0.10, elXL: -0.45,
  torsoX: 0, torsoY: 0, hips: 0,
};

/** phase: 'windup' | 'strike' | 'recover', k: 0..1 through that phase. */
function attackPose(style, phase, k) {
  const p = { ...REST_POSE };
  const ease = k * k * (3 - 2 * k);

  switch (style) {
    /* --- bare fists: zombies and skeletons --- */
    case 'fists': {
      if (phase === 'windup') {
        p.shXR = lerp(-0.4, -0.75, ease); p.elXR = lerp(-0.6, -2.05, ease);
        p.shZR = -0.30; p.torsoY = lerp(0, 0.42, ease); p.torsoX = -0.10;
        p.shXL = -0.9; p.elXL = -1.1;
      } else if (phase === 'strike') {
        p.shXR = lerp(-0.75, -1.52, ease); p.elXR = lerp(-2.05, -0.10, ease);
        p.shZR = -0.12; p.torsoY = lerp(0.42, -0.34, ease); p.torsoX = 0.14;
        p.shXL = -0.8; p.elXL = -1.2;
      } else {
        p.shXR = lerp(-1.52, -0.5, ease); p.elXR = lerp(-0.10, -0.7, ease);
        p.torsoY = lerp(-0.34, 0, ease); p.torsoX = lerp(0.14, 0, ease);
        p.shXL = -0.85; p.elXL = -1.1;
      }
      return p;
    }

    /* --- sword: a horizontal sweep, which reads best from behind --- */
    case 'slash': {
      if (phase === 'windup') {
        p.shXR = lerp(-0.5, -1.15, ease); p.shZR = lerp(-0.1, -0.95, ease);
        p.elXR = lerp(-0.6, -1.15, ease);
        p.torsoY = lerp(0, 0.62, ease); p.torsoX = -0.08;
        p.shXL = -0.55; p.shZL = 0.55; p.elXL = -1.15;
      } else if (phase === 'strike') {
        p.shXR = lerp(-1.15, -1.30, ease); p.shZR = lerp(-0.95, 0.70, ease);
        p.elXR = lerp(-1.15, -0.22, ease);
        p.torsoY = lerp(0.62, -0.68, ease); p.torsoX = 0.12;
        p.shXL = -0.5; p.shZL = 0.62; p.elXL = -1.05;
      } else {
        p.shXR = lerp(-1.30, -0.45, ease); p.shZR = lerp(0.70, -0.1, ease);
        p.elXR = lerp(-0.22, -0.65, ease);
        p.torsoY = lerp(-0.68, 0, ease); p.torsoX = lerp(0.12, 0, ease);
        p.shXL = -0.5; p.shZL = 0.5; p.elXL = -1.0;
      }
      return p;
    }

    /* --- knight special: a straight thrust --- */
    case 'jab': {
      if (phase === 'windup') {
        p.shXR = lerp(-0.5, -0.65, ease); p.elXR = lerp(-0.6, -2.15, ease);
        p.shZR = -0.22; p.torsoY = lerp(0, 0.34, ease);
        p.shXL = -0.6; p.shZL = 0.5; p.elXL = -1.2;
      } else if (phase === 'strike') {
        p.shXR = lerp(-0.65, -1.56, ease); p.elXR = lerp(-2.15, 0.02, ease);
        p.shZR = lerp(-0.22, -0.02, ease);
        p.torsoY = lerp(0.34, -0.16, ease); p.torsoX = 0.16;
        p.shXL = -0.7; p.shZL = 0.62; p.elXL = -1.3;
      } else {
        p.shXR = lerp(-1.56, -0.5, ease); p.elXR = lerp(0.02, -0.6, ease);
        p.torsoY = lerp(-0.16, 0, ease); p.torsoX = lerp(0.16, 0, ease);
        p.shXL = -0.6; p.shZL = 0.5; p.elXL = -1.15;
      }
      return p;
    }

    /* --- wizard basic: thrust the staff and let the orb fire --- */
    case 'cast': {
      if (phase === 'windup') {
        p.shXR = lerp(-0.4, -1.95, ease); p.elXR = lerp(-0.5, -0.75, ease);
        p.shZR = -0.14; p.torsoX = lerp(0, -0.12, ease);
        p.shXL = -0.3; p.elXL = -0.6;
      } else if (phase === 'strike') {
        p.shXR = lerp(-1.95, -1.30, ease); p.elXR = lerp(-0.75, -0.20, ease);
        p.torsoX = lerp(-0.12, 0.14, ease); p.torsoY = -0.12;
        p.shXL = -0.4; p.elXL = -0.7;
      } else {
        p.shXR = lerp(-1.30, -0.45, ease); p.elXR = lerp(-0.20, -0.55, ease);
        p.torsoX = lerp(0.14, 0, ease);
        p.shXL = -0.35; p.elXL = -0.6;
      }
      return p;
    }

    /* --- wizard special: beam from the OPEN LEFT HAND --- */
    case 'beam': {
      const t = phase === 'windup' ? ease * 0.5
        : phase === 'strike' ? 1
          : 1 - ease;
      p.shXL = lerp(-0.3, -1.58, t); p.elXL = lerp(-0.6, -0.05, t);
      p.shZL = lerp(0.1, 0.06, t);
      p.shXR = lerp(-0.4, -1.05, t * 0.6); p.elXR = -0.9;
      p.torsoX = lerp(0, -0.10, t); p.torsoY = lerp(0, 0.22, t);
      return p;
    }

    /* --- archer: draw and loose --- */
    case 'shoot':
    case 'twinshot': {
      const wide = style === 'twinshot' ? 0.16 : 0;
      if (phase === 'windup') {
        p.shXL = lerp(-0.5, -1.52, ease); p.elXL = lerp(-0.7, -0.06, ease);
        p.shZL = lerp(0.1, 0.06, ease);
        p.shXR = lerp(-0.5, -1.24, ease); p.elXR = lerp(-0.6, -1.75 - wide, ease);
        p.shZR = -0.30; p.torsoY = lerp(0, 0.30, ease);
      } else if (phase === 'strike') {
        p.shXL = -1.52; p.elXL = -0.06; p.shZL = 0.06;
        p.shXR = lerp(-1.24, -1.05, ease); p.elXR = lerp(-1.75 - wide, -0.95, ease);
        p.torsoY = 0.28;
      } else {
        p.shXL = lerp(-1.52, -0.45, ease); p.elXL = lerp(-0.06, -0.6, ease);
        p.shXR = lerp(-1.05, -0.45, ease); p.elXR = lerp(-0.95, -0.6, ease);
        p.torsoY = lerp(0.28, 0, ease);
      }
      return p;
    }
  }
  return p;
}

/**
 * Guard stance. The knight brings the shield ACROSS the chest -- a negative
 * shoulder-Z swings the left arm inward, which is what puts the shield between
 * the player and the threat rather than out by his hip.
 */
function blockPose(classId) {
  const p = { ...REST_POSE };
  if (classId === 'knight') {
    p.shXL = -1.18; p.shZL = -0.42; p.elXL = -1.20;
    p.shXR = -0.42; p.shZR = -0.34; p.elXR = -1.45;
    p.torsoY = 0.30;                 // turn the shield shoulder forward
  } else {
    p.shXL = -1.20; p.shZL = 0.38; p.elXL = -1.40;
    p.shXR = -1.20; p.shZR = -0.38; p.elXR = -1.40;
  }
  p.torsoX = 0.18;
  p.hips = -0.07;
  return p;
}

/* ---------------- humanoid animator ---------------- */

export class CharacterAnimator {
  constructor(rig) {
    this.rig = rig;
    this.rest = rig.rest || { shoulderX: -0.15, shoulderZ: 0.10, elbowXR: -0.45, elbowXL: -0.45 };
    this.phase = 0;
    this.t = 0;
    this.wLoco = 0;
    this.wAir = 0;
    this.wRun = 0;
    this.wPose = 0;       // how strongly an attack/block pose overrides
    this.wCrouch = 0;
    this.wDash = 0;
    this.wSit = 0;
    this.wDraw = 0;       // wizard drawing mana
    this.wPull = 0;       // archer pulling arrows
    this.chT = 0;
    this.squash = 0;
    this.lean = 0;
    this.flinch = 0;
    this.pose = { ...REST_POSE };
  }

  update(dt, state) {
    const rig = this.rig;
    const R = this.rest;
    this.t += dt;

    const maxSpeed = state.maxSpeed || 6.4;
    const sNorm = clamp01(state.speed / maxSpeed);
    const moving = state.speed > 0.35;

    this.wLoco = damp(this.wLoco, moving ? clamp01(state.speed / 1.6) : 0, 14, dt);
    this.wAir = damp(this.wAir, state.grounded ? 0 : 1, 11, dt);
    this.wRun = damp(this.wRun, state.running && moving ? 1 : 0, 8, dt);
    this.wCrouch = damp(this.wCrouch, state.crouching ? 1 : 0, 12, dt);
    this.wDash = damp(this.wDash, state.dashing ? 1 : 0, state.dashing ? 26 : 9, dt);
    this.wSit = damp(this.wSit, state.sitting ? 1 : 0, 6, dt);
    // CHANNELLING: holding both action buttons. The two classes do visibly
    // different things with it, so the weight is split in two.
    const ch = state.channel;
    this.wDraw = damp(this.wDraw, ch && ch.kind === 'wizard' ? 1 : 0, 9, dt);
    this.wPull = damp(this.wPull, ch && ch.kind === 'archer' ? 1 : 0, 9, dt);
    this.chT = ch ? this.chT + dt : 0;

    if (state.justLanded) this.squash = Math.max(this.squash, state.landImpact ?? 0.5);
    this.squash = damp(this.squash, 0, 9, dt);
    if (state.hurt) this.flinch = 1;
    this.flinch = damp(this.flinch, 0, 10, dt);

    // Freezing the phase when stopped is fine: wLoco fades the stride out, so
    // the legs settle rather than snapping back to zero.
    const strideRate = 2.2 + sNorm * 4.6;
    if (moving && state.grounded) this.phase += dt * strideRate;
    const ph = this.phase;

    rig.resetPose();

    /* ---------------- upper-body override ---------------- */
    let target = null;
    if (state.attack) {
      target = attackPose(state.attack.style, state.attack.phase, clamp01(state.attack.k));
    } else if (state.blocking) {
      target = blockPose(rig.classId);
    }
    this.wPose = damp(this.wPose, target ? 1 : 0, target ? 22 : 12, dt);
    if (target) this.pose = target;
    const W = this.wPose;

    /* ---------------- legs ---------------- */
    const legAmp = lerp(0.42, 0.85, this.wRun) * this.wLoco;
    const kneeAmp = lerp(0.55, 1.05, this.wRun) * this.wLoco;

    for (const side of ['L', 'R']) {
      const l = rig.legs[side];
      const o = side === 'L' ? 0 : Math.PI;
      const sw = Math.sin(ph + o);

      let hipX = -sw * legAmp;
      let kneeX = Math.max(0, -Math.sin(ph + o - 0.7)) * kneeAmp;

      const airHip = side === 'L' ? -0.62 : -0.10;
      const airKnee = side === 'L' ? 1.05 : 0.35;
      const falling = clamp01(-(state.vy ?? 0) / 8);
      hipX = lerp(hipX, lerp(airHip, airHip * 0.4, falling), this.wAir);
      kneeX = lerp(kneeX, lerp(airKnee, airKnee * 0.5, falling), this.wAir);

      hipX -= this.squash * 0.55;
      kneeX += this.squash * 1.0;

      // a braced stance while blocking or swinging
      if (W > 0.01) {
        const braceHip = side === 'L' ? -0.22 : 0.16;
        hipX = lerp(hipX, hipX * 0.35 + braceHip, W * 0.55);
        kneeX = lerp(kneeX, kneeX * 0.4 + 0.26, W * 0.55);
      }

      // crouching: thighs forward, knees deeply bent, stance widened
      if (this.wCrouch > 0.01) {
        hipX += -0.52 * this.wCrouch;
        kneeX += 1.15 * this.wCrouch;
      }

      // sitting: legs stretched out in front, knees loosely bent
      if (this.wSit > 0.01) {
        hipX = lerp(hipX, -1.42, this.wSit);
        kneeX = lerp(kneeX, 0.46, this.wSit);
      }
      // braced for both channels: feet planted, knees bent, weight low
      const brace = Math.max(this.wDraw, this.wPull);
      if (brace > 0.01) {
        hipX = lerp(hipX, 0.22, brace);
        kneeX = lerp(kneeX, -0.44, brace);
      }

      l.hip.rotation.x = hipX;
      l.knee.rotation.x = kneeX;
      l.ankle.rotation.x = -(hipX * 0.35 + kneeX * 0.55);
      l.hip.rotation.z = (side === 'L' ? 1 : -1)
        * (0.03 + 0.10 * this.wCrouch + 0.16 * this.wSit);
    }

    /* ---------------- arms ---------------- */
    for (const side of ['L', 'R']) {
      const a = rig.arms[side];
      const s = side === 'L' ? 1 : -1;
      const o = side === 'L' ? Math.PI : 0;
      const sw = Math.sin(ph + o);
      const idleSway = Math.sin(this.t * 1.5 + (side === 'L' ? 0 : 1.7)) * 0.035;

      let shX = R.shoulderX + sw * lerp(0.34, 0.72, this.wRun) * this.wLoco
        + idleSway * (1 - this.wLoco);
      let shZ = s * (R.shoulderZ + this.wRun * 0.06);
      let elX = (side === 'R' ? R.elbowXR : R.elbowXL)
        - this.wRun * 0.35 - Math.max(0, sw) * 0.30 * this.wLoco;

      const airShX = lerp(-2.0, -0.9, clamp01(-(state.vy ?? 0) / 8));
      shX = lerp(shX, airShX, this.wAir);
      shZ = lerp(shZ, s * 0.42, this.wAir);
      elX = lerp(elX, -0.55, this.wAir);

      if (W > 0.01) {
        const p = this.pose;
        shX = lerp(shX, side === 'R' ? p.shXR : p.shXL, W);
        shZ = lerp(shZ, side === 'R' ? p.shZR : p.shZL, W);
        elX = lerp(elX, side === 'R' ? p.elXR : p.elXL, W);
      }

      // arms tuck in when sneaking, and sweep back through a dash
      shX -= 0.30 * this.wCrouch;
      elX -= 0.45 * this.wCrouch;
      shZ *= 1 - 0.35 * this.wCrouch;
      shX += 0.55 * this.wDash;

      if (this.wSit > 0.01) {
        shX = lerp(shX, -0.18, this.wSit);
        shZ = lerp(shZ, s * 0.40, this.wSit);
        elX = lerp(elX, -0.62, this.wSit);
      }

      // THE WIZARD DRAWING MANA: both arms come up and out, palms open, with
      // a slow tremor -- it should look like effort, not like standing still.
      if (this.wDraw > 0.01) {
        const tremor = Math.sin(this.chT * 13 + s) * 0.045;
        shX = lerp(shX, -1.62 + tremor, this.wDraw);
        shZ = lerp(shZ, s * 0.62, this.wDraw);
        elX = lerp(elX, -0.55 + tremor * 1.4, this.wDraw);
      }

      // THE ARCHER PULLING ARROWS: one hand down and reaching, hauling back
      // in a slow rhythm, the other braced across the body.
      if (this.wPull > 0.01) {
        const haul = Math.sin(this.chT * 3.4);
        const reach = s > 0 ? haul : -haul * 0.3;
        shX = lerp(shX, 0.72 + reach * 0.34, this.wPull);
        shZ = lerp(shZ, s * 0.20, this.wPull);
        elX = lerp(elX, -1.30 - Math.max(0, reach) * 0.55, this.wPull);
      }

      a.shoulder.rotation.x = shX;
      a.shoulder.rotation.z = shZ;
      a.elbow.rotation.x = elX;
    }

    // The whole body sells it: the wizard tips back and up as it gathers,
    // the archer stoops down over the work.
    if (this.wDraw > 0.01 || this.wPull > 0.01) {
      const pulse = Math.sin(this.chT * 6) * 0.02;
      rig.torso.rotation.x += -0.24 * this.wDraw + 0.42 * this.wPull + pulse;
      rig.root.position.y += (0.05 + pulse) * this.wDraw - 0.10 * this.wPull;
      if (rig.neck) rig.neck.rotation.x += -0.30 * this.wDraw + 0.34 * this.wPull;
    }

    // Keep the shield face pointing forward whatever the arm is doing. Both
    // joints rotate about X, so cancelling their sum is enough.
    const shield = rig.gear && rig.gear.shield;
    if (shield) {
      const arm = rig.arms.L;
      shield.rotation.x = -(arm.shoulder.rotation.x + arm.elbow.rotation.x) - 0.10;
    }

    /* ---------------- torso, hips, head ---------------- */
    const bob = Math.sin(ph * 2) * 0.035 * this.wLoco * lerp(0.6, 1.4, this.wRun);
    const breathe = Math.sin(this.t * 1.6) * 0.012 * (1 - this.wLoco);
    rig.hips.position.y = lerp(
      rig.hipY + bob + breathe - this.squash * 0.30
        + (W > 0.01 ? this.pose.hips * W : 0)
        - this.wCrouch * 0.34,
      0.34,                                  // seated on the ground
      this.wSit
    );

    this.lean = damp(this.lean, sNorm * lerp(0.10, 0.26, this.wRun), 6, dt);
    let torsoX = this.lean + (state.hunch ?? 0) - this.squash * 0.18 - this.flinch * 0.22
      + this.wCrouch * 0.36 + this.wDash * 0.30;
    let torsoY = -Math.sin(ph) * 0.10 * this.wLoco;
    if (W > 0.01) {
      torsoX = lerp(torsoX, torsoX * 0.4 + this.pose.torsoX, W);
      torsoY = lerp(torsoY, this.pose.torsoY, W);
    }
    if (this.wSit > 0.01) torsoX = lerp(torsoX, -0.20, this.wSit);
    rig.torso.rotation.x = torsoX;
    rig.torso.rotation.y = torsoY;
    rig.torso.rotation.z = Math.sin(ph) * 0.04 * this.wLoco;

    rig.neck.rotation.x = -this.lean * 0.7 + Math.sin(ph * 2 + 1) * 0.02 * this.wLoco
      + this.flinch * 0.25;
    rig.neck.rotation.y = Math.sin(ph) * 0.06 * this.wLoco - torsoY * 0.45;

    if (rig.cape) {
      rig.cape.rotation.x = -0.06 - sNorm * 0.30 - this.wAir * 0.25
        + Math.sin(this.t * 3.1) * 0.03;
      rig.cape.rotation.z = Math.sin(this.t * 2.3) * 0.04 + Math.sin(ph) * 0.05 * this.wLoco;
    }

    if (rig.shadow) {
      const h = Math.max(0, state.height ?? 0);
      const k = clamp01(1 - h / 3.2);
      rig.shadow.position.y = -h + 0.02;
      rig.shadow.scale.setScalar(lerp(0.55, 1, k));
      rig.shadow.material.opacity = lerp(0.15, 0.85, k);
    }
  }
}

/* ---------------- slime ---------------- */

export class SlimeAnimator {
  constructor(slime) {
    this.slime = slime;
    this.t = Math.random() * 6;
    this.hopT = 0;
    this.y = 0;
  }

  update(dt, state = {}) {
    const s = this.slime;
    this.t += dt;
    const moving = (state.speed ?? 0) > 0.2;
    let sx = 1, sy = 1;

    if (state.attack) {
      // the leap: coil, stretch, splat
      const k = clamp01(state.attack.k);
      if (state.attack.phase === 'windup') { sy = 1 - 0.34 * k; sx = 1 + 0.26 * k; }
      else if (state.attack.phase === 'strike') { sy = 1 + 0.30; sx = 1 - 0.16; }
      else { sy = 1 - 0.30 * (1 - k); sx = 1 + 0.24 * (1 - k); }
      this.y = damp(this.y, 0, 12, dt);
    } else if (moving) {
      this.hopT += dt * 2.6;
      const c = this.hopT % 1;
      const air = Math.sin(c * Math.PI);
      this.y = air * 0.42;
      if (c < 0.18) { const k = c / 0.18; sy = 1 - 0.30 * (1 - k); sx = 1 + 0.22 * (1 - k); }
      else if (c > 0.82) { const k = (c - 0.82) / 0.18; sy = 1 - 0.34 * k; sx = 1 + 0.26 * k; }
      else { sy = 1 + air * 0.20; sx = 1 - air * 0.12; }
    } else {
      this.hopT = 0;
      this.y = damp(this.y, 0, 10, dt);
      const w = Math.sin(this.t * 2.4) * 0.07;
      sy = 1 - w; sx = 1 + w;
    }

    if (state.hurt) { sx *= 1.16; sy *= 0.84; }

    s.jelly.scale.set(sx, sy, sx);
    s.jelly.position.y = this.y;
    s.eyes.position.y = 0.42 + this.y + Math.sin(this.t * 2.4) * 0.02;
    s.eyes.scale.setScalar(state.hurt ? 1.2 : 1);
    s.core.position.y = 0.29 - this.y * 0.12;

    const k = clamp01(1 - this.y / 1.2);
    s.shadow.scale.setScalar(lerp(0.6, 1, k));
    s.shadow.material.opacity = lerp(0.3, 0.85, k);
  }
}

export function makeAnimator(entity) {
  // A blob has no arms to swing. Dispatch on the SHAPE it was built with, not
  // on a list of names -- every new slime variant would otherwise be handed a
  // humanoid animator and crash on arms.L the moment it moved.
  return entity.jelly ? new SlimeAnimator(entity) : new CharacterAnimator(entity);
}
