// ===================== NIGHT SHIFT :: THE TRAFFIC STOP =====================
// What happens when they are suspicious but do not actually know anything.
//
// Before this there were two states: invisible, or hunted. Nothing in between,
// which meant a patrol either ignored you completely or tried to kill you. Real
// police work is mostly the middle - somebody who looks a bit wrong gets pulled
// over, gets asked, and either gets sent on their way or gets taken in.
//
// That middle is now the most dangerous part of the game, because it is the one
// place you can lose without a shot being fired: if you stop and they have
// something that matches you, you are in the back of the car. And if you run,
// you have just told them you were worth stopping.
//
//   SUSPECTED   a unit lights you up and wants you to stop
//   STOPPING    you are slowing down with them behind you
//   QUESTIONED  they are at the window, checking
//   CLEARED     nothing matched. They go. Suspicion resets.
//   TAKEN       something matched. That is the run.
//
// Running at any point turns it into a chase, and hands them a reason.

export const STOP = {
  NONE: 0, SUSPECTED: 1, STOPPING: 2, QUESTIONED: 3, CLEARED: 4, TAKEN: 5,
};

export class TrafficStop {
  constructor() { this.reset(); }

  reset() {
    this.state = STOP.NONE;
    this.t = 0;
    this.unit = null;
    this.suspicion = 0;       // 0..1, builds from things that look wrong
    this.cooldown = 0;        // after a clearing, they leave you alone a while
    this.fled = false;
    this.result = null;
  }

  // Things that make a patrol look twice without them knowing anything.
  // Deliberately mundane: this is the stuff that gets ordinary people stopped.
  addSuspicion(dt, w) {
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    let s = 0;
    if (w.speeding) s += 0.30;
    if (w.wrongSide) s += 0.22;
    if (w.damaged) s += 0.26;          // a bashed-up car at 3 a.m.
    if (w.maskedInPublic) s += 0.55;   // a balaclava on the street is not subtle
    if (w.nearScene) s += 0.20;
    if (w.buildMatches) s += 0.18;     // they have a build and you fit it
    if (w.runningOnFoot) s += 0.16;
    if (s === 0) { this.suspicion = Math.max(0, this.suspicion - dt * 0.30); return; }
    this.suspicion = Math.min(1, this.suspicion + dt * s);
  }

  // A unit close enough to act on it decides to pull you over.
  maybeStop(unit, w) {
    if (this.state !== STOP.NONE || this.cooldown > 0) return false;
    if (this.suspicion < 0.55) return false;
    if (w.recognised) return false;    // they know: that is a chase, not a stop
    this.state = STOP.SUSPECTED;
    this.unit = unit;
    this.t = 0;
    this.fled = false;
    return true;
  }

  update(dt, w) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.state === STOP.NONE) return null;
    this.t += dt;

    // At any point, going fast again is running - and running is an answer.
    if (this.state < STOP.QUESTIONED && w.speed > 11) {
      this.fled = true;
      this.state = STOP.NONE;
      this.suspicion = 1;
      return { fled: true };
    }

    switch (this.state) {
      case STOP.SUSPECTED:
        // they are behind you with the lights on, waiting for you to slow
        if (w.speed < 3) { this.state = STOP.STOPPING; this.t = 0; }
        else if (this.t > 14) {         // ignoring them is also an answer
          this.fled = true; this.state = STOP.NONE; this.suspicion = 1;
          return { fled: true };
        }
        break;

      case STOP.STOPPING:
        // an officer walks up. This is the moment to change your mind.
        if (this.t > 3.5) { this.state = STOP.QUESTIONED; this.t = 0; }
        break;

      case STOP.QUESTIONED: {
        if (this.t < 4.5) break;
        // What can they actually check you against? If they have nothing that
        // fits, there is no reason to hold you - which is the whole reward for
        // having covered your face and changed your clothes.
        const hits = [];
        if (w.known.face && !w.masked) hits.push('face');
        if (w.known.clothing && !w.changed) hits.push('clothes');
        if (w.known.vehicle && w.inCrimeCar) hits.push('vehicle');
        if (w.known.prints && w.identified) hits.push('prints');
        // build alone is not enough to hold anyone, and never has been
        if (hits.length) {
          this.state = STOP.TAKEN;
          this.result = hits;
          return { taken: true, on: hits };
        }
        this.state = STOP.CLEARED;
        this.t = 0;
        return { cleared: true };
      }

      case STOP.CLEARED:
        if (this.t > 2.5) {
          this.state = STOP.NONE;
          this.unit = null;
          this.suspicion = 0;
          this.cooldown = 45;           // that unit is done with you
        }
        break;

      default: break;
    }
    return null;
  }

  get label() {
    switch (this.state) {
      case STOP.SUSPECTED: return 'PULL OVER — OR DO NOT';
      case STOP.STOPPING: return 'STAY STILL';
      case STOP.QUESTIONED: return 'BEING QUESTIONED';
      case STOP.CLEARED: return 'ON YOUR WAY';
      default: return null;
    }
  }
}
