// Turning what the deck actually did into a name and a payout.
//
// Nothing here is a lookup of "the player pressed the kickflip button" -- there
// is no kickflip button. These names are read back off the rotation counts the
// physics ended up with, which is why a scrappy flick can genuinely come out as
// a hardflip you did not mean to do.
//
// Four independent numbers go in and every combination of them has a name:
//
//   flips    deck roll, whole turns.  + kickflip, - heelflip
//   shoves   deck yaw, HALF turns.    + frontside, - backside
//   body     your own spin, half turns
//   popEnd   which end you popped off. + nollie, - ollie
//
// The interesting names live where those interact: same-direction body and
// shove is a bigspin, a tre flip is one roll plus a 360 shove, and everything
// with an odd number of half turns anywhere rolls away fakie.

const ORD = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '];

export function nameAir(a, bodyHalf, popEnd, airTime) {
  const f = clampCount(a.flips);
  const sh = clampCount(a.shoves);
  const pi = clampCount(a.pitches);
  const nf = Math.abs(f), ns = Math.abs(sh), np = Math.abs(pi);
  const bh = Math.abs(bodyHalf);
  const sameWay = bodyHalf !== 0 && sh !== 0 && Math.sign(bodyHalf) === Math.sign(sh);
  const flipWord = f > 0 ? 'KICKFLIP' : 'HEELFLIP';

  let name = '';
  let pts = 0;
  let bodyNamed = false;      // set when the body spin is baked into the name

  // --- the ones that have their own names ---------------------------------
  if (sameWay && ns >= 2 && bh >= 1) {
    // body and deck going round together
    const spin = bh === 1 ? 'BIGSPIN' : bh === 2 ? 'BIGGERSPIN' : 'BIGGESTSPIN';
    bodyNamed = true;
    if (nf === 1) {
      name = (f > 0 ? 'BIG FLIP' : 'BIG HEELFLIP');
      if (bh >= 3) name = f > 0 ? 'GAZELLE FLIP' : 'GAZELLE HEELFLIP';
      pts = 320 + 80 * bh;
    } else if (nf > 1) {
      name = ORD[Math.min(4, nf)] + 'BIG FLIP';
      pts = 340 + 90 * nf + 60 * bh;
    } else {
      name = spin;
      pts = 180 + 70 * bh;
    }
  } else if (nf === 1 && ns === 2) {
    name = f > 0 ? 'TRE FLIP' : 'LASER FLIP';
    pts = 240;
  } else if (nf === 1 && ns === 3) {
    name = f > 0 ? '540 FLIP' : '540 HEELFLIP';
    pts = 380;
  } else if (nf === 2 && ns === 2) {
    name = f > 0 ? 'DOUBLE TRE' : 'DOUBLE LASER';
    pts = 460;
  } else if (nf === 1 && ns === 1) {
    if (f > 0) name = sh < 0 ? 'VARIAL KICKFLIP' : 'HARDFLIP';
    else name = sh > 0 ? 'VARIAL HEELFLIP' : 'INWARD HEELFLIP';
    pts = 170;
  } else if (nf === 2 && ns === 1) {
    name = 'DOUBLE ' + (f > 0 && sh < 0 ? 'VARIAL KICKFLIP'
      : f > 0 ? 'HARDFLIP' : sh > 0 ? 'VARIAL HEELFLIP' : 'INWARD HEELFLIP');
    pts = 300;
  } else if (nf && ns) {
    name = ORD[Math.min(4, nf)] + flipWord + ' ' + shoveName(sh);
    pts = 95 * nf + 65 * ns;
  } else if (nf) {
    name = ORD[Math.min(4, nf)] + flipWord;
    pts = 85 * nf + (nf > 1 ? 70 * (nf - 1) : 0);
  } else if (ns) {
    name = shoveName(sh);
    pts = 55 * ns + (ns > 2 ? 60 : 0);
  }

  if (np) {
    // A PIERCE FLIP. The deck wraps end over end the way an impossible does,
    // goes right over onto its graphic on the way, and comes back down on its
    // wheels. It gets its own name because "kickflip impossible" describes the
    // parts rather than the thing you actually watch happen.
    if (nf === 1 && np === 1 && !ns) {
      name = f > 0 ? 'PIERCE FLIP' : 'PIERCE HEELFLIP';
      pts = 300;
    } else if (nf === 1 && np === 2 && !ns) {
      name = f > 0 ? 'DOUBLE PIERCE' : 'DOUBLE PIERCE HEEL';
      pts = 470;
    } else if (nf === 2 && np === 1 && !ns) {
      name = f > 0 ? 'PIERCE DOUBLE FLIP' : 'PIERCE DOUBLE HEEL';
      pts = 480;
    } else {
      name = (name ? name + ' ' : '') + (np > 1 ? ORD[Math.min(4, np)] : '') + 'IMPOSSIBLE';
      pts += 130 * np;
    }
  }

  if (!name) {
    name = popEnd > 0 ? 'NOLLIE' : 'OLLIE';
    pts = 25;
    if (bh) { name = ''; pts = 0; }     // a bare body spin names itself below
  }

  // --- your own rotation ---------------------------------------------------
  if (bh && !bodyNamed) {
    const side = bodyHalf > 0 ? 'FRONTSIDE ' : 'BACKSIDE ';
    name = side + (bh * 180) + (name ? ' ' + name : '');
    pts += 55 * bh * bh;
  }

  // --- which end you popped off -------------------------------------------
  // Only worth saying when there was a trick to say it about.
  if (popEnd > 0 && name.indexOf('NOLLIE') < 0) {
    name = 'NOLLIE ' + name;
    pts = Math.round(pts * 1.25);
  }

  if ((ns % 2) === 1 || (bh % 2) === 1) name += ' TO FAKIE';

  pts += Math.round(Math.min(1.6, airTime) * 45);
  return { name: name.trim(), points: Math.max(10, Math.round(pts)) };
}

function shoveName(sh) {
  const n = Math.abs(sh);
  const side = sh > 0 ? 'FRONTSIDE ' : 'BACKSIDE ';
  if (n === 1) return side + 'SHOVE-IT';
  return side + (n * 180) + ' SHOVE-IT';
}

// Grinds are named off the deck's yaw when it lands on the bar, and off where
// your weight is: weight on the nose makes the same angle a different trick.
export function nameGrind(yaw, foot, kind) {
  const a = Math.abs(Math.cos(yaw));      // 1 = deck along the bar, 0 = across it
  const across = Math.sin(yaw) >= 0;
  let name, rate;
  if (a > 0.62) {
    if (foot > 0.35) { name = 'NOSEGRIND'; rate = 34; }
    else if (foot < -0.35) { name = '5-0 GRIND'; rate = 34; }
    else { name = '50-50 GRIND'; rate = 24; }
  } else if (a > 0.3) {
    name = across ? 'CROOKED GRIND' : 'SALAD GRIND';
    rate = 36;
  } else {
    if (foot > 0.35) { name = 'NOSESLIDE'; rate = 36; }
    else if (foot < -0.35) { name = 'TAILSLIDE'; rate = 38; }
    else { name = across ? 'BOARDSLIDE' : 'LIPSLIDE'; rate = 32; }
  }
  if (kind === 'ledge') rate += 4;
  return { name, rate };
}

export function nameManual(foot) {
  return foot > 0 ? { name: 'NOSE MANUAL', rate: 16 } : { name: 'MANUAL', rate: 14 };
}

function clampCount(n) { return Math.max(-4, Math.min(4, n)); }

// --- the combo ledger -------------------------------------------------------
export function createScore(best) {
  return {
    total: 0,
    best: best || 0,
    chain: [],
    chainPts: 0,
    mult: 1,
    hold: 0,
    lastName: '',
    flash: 0,
    banked: 0,
    events: [],        // names landed this frame, for a competition to watch

    add(name, pts) {
      // repeating the same trick in one line is worth less each time
      const seen = this.chain.filter((n) => n === name).length;
      this.chain.push(name);
      this.chainPts += Math.round(pts * Math.pow(0.6, seen));
      this.mult = Math.min(12, this.chain.length);
      this.hold = 1.5;
      this.lastName = name;
      this.flash = 1;
      this.events.push(name);
    },
    tick(pts) { this.chainPts += pts; this.hold = Math.max(this.hold, 0.5); },

    update(dt, rolling) {
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
      if (!this.chain.length) return;
      this.hold -= dt * (rolling ? 1 : 2.2);
      if (this.hold <= 0) this.bank();
    },

    bank() {
      if (!this.chain.length) return 0;
      const got = Math.round(this.chainPts * this.mult);
      this.total += got;
      this.banked += got;
      if (this.total > this.best) this.best = this.total;
      this.chain = []; this.chainPts = 0; this.mult = 1; this.hold = 0;
      return got;
    },

    bail() {
      this.chain = []; this.chainPts = 0; this.mult = 1; this.hold = 0;
      this.lastName = 'BAILED';
      this.flash = 1;
    },
  };
}
