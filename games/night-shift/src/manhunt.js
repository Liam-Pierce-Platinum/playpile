// ===================== NIGHT SHIFT :: THE MANHUNT =====================
// The police do not look for "you". They look for a DESCRIPTION, and they build
// it one piece at a time from what you left behind.
//
// That is the whole game. Every item you buy before the job denies them one
// line of that description; everything you do afterwards is either shedding a
// line they already have, or avoiding giving them a new one.
//
//   VEHICLE     the car and its plate. Shed by swapping cars, or by changing
//               plates if you bought a set.
//   CLOTHING    what you were wearing. Shed by changing - which means you had
//               to have brought a change.
//   FACE        the one that matters. Once they have your face they have your
//               name, and once they have your name they have your address.
//               A ski mask denies it outright, but only if you had one ON.
//   PRINTS      you touched things. Gloves deny it. Without them it is only a
//               matter of time, and it leads to the same place a face does.
//   BUILD       height and frame. You cannot change this one. It never fully
//               clears you, it just narrows the field - which is why it is the
//               floor under the whole thing rather than a line you can shed.
//
// IDENTIFIED is the hinge. Before it you are a description; after it you are a
// person with an address, a bank card and a face on every screen in the city.
//
// You also have to eat, drink and sleep, which is what stops "park in a garage
// and wait" being the answer to everything. Buying those things costs money,
// and paying by card tells them exactly which shop you were standing in.

export const KIT = [
  { id: 'mask', name: 'SKI MASK', price: 60,
    note: 'They never get your face. The single most valuable thing you can own — and useless in your pocket.' },
  { id: 'gloves', name: 'GLOVES', price: 35,
    note: 'No prints on anything you touch. Prints lead to your name just as surely as a face does.' },
  { id: 'plates', name: 'COLD PLATES', price: 140,
    note: 'Swap them and the vehicle description dies with them. Buys you the car back.' },
  { id: 'change', name: 'CHANGE OF CLOTHES', price: 55,
    note: 'A second outfit in a bag. Lets you drop the clothing description without stealing a wardrobe.' },
  { id: 'burner', name: 'BURNER PHONE', price: 90,
    note: 'Your own phone is a map of everywhere you have been. This one is not.' },
  { id: 'cash', name: 'DRAW OUT CASH', price: 90, gives: 90,
    note: 'Not a purchase - it moves money out of a traceable account into notes. What it costs you is the mask you did not buy instead.' },
  { id: 'food', name: 'FOOD & WATER', price: 45,
    note: 'Enough for a few hours holed up. Going out for it while the net is closing is how people get taken.' },
];

// What they know, and how they came to know it.
const LINES = ['vehicle', 'clothing', 'face', 'prints', 'build'];

export class Manhunt {
  constructor() { this.reset({}); }

  reset(kit) {
    this.kit = kit || {};
    this.cash = this.kit.cash ? 90 : 0;
    this.card = 1;                        // the card still works, that is the problem

    // ---- the description ----
    // 0 = they have nothing. 1 = they have it and it is out on the radio.
    this.known = { vehicle: 0, clothing: 0, face: 0, prints: 0, build: 0 };
    this.identified = false;
    this.wearingMask = !!this.kit.mask;
    this.plateSwapped = false;

    // ---- the scene ----
    this.scene = null;                    // where it happened
    this.sceneWork = 0;                   // how much of it they have processed
    this.responded = false;

    // ---- pressure ----
    this.wanted = 0;                      // 0..1, the size of the response
    this.cordon = 0;                      // how much of the road network is shut
    this.houseRaided = false;
    this.pings = [];                      // card transactions they can see
    this.witnesses = 0;                   // people who were there
    this.canvassed = 0;                   // and how many have been spoken to
    this.tips = [];                       // calls from the public
    this.tipT = 0;

    // tips go cold - a sighting from four minutes ago is not a lead
    for (let i = this.tips.length - 1; i >= 0; i--) {
      if (this.t - this.tips[i].t > 75) this.tips.splice(i, 1);
    }

    // ---- needs ----
    this.food = 1; this.water = 1; this.energy = 1;
    this.supplies = this.kit.food ? 3 : 0;
    this.exhausted = false;

    this.won = false;
    this.t = 0;
  }

  // The job itself. Whatever you were not wearing at this moment is what they
  // are going to be able to prove, and there is no fixing it afterwards.
  commit(x, y, witnesses) {
    this.scene = { x, y, t: 0 };
    // Nobody about? Then nobody can describe you, and the only thing they
    // will ever have is what they can lift off the surfaces.
    this.witnesses = witnesses || 0;
    this.canvassed = 0;
    this.wanted = 0.45;
    // build is always available - somebody saw a person
    this.pending = {
      build: 1,
      face: this.wearingMask ? 0 : 1,
      prints: this.kit.gloves ? 0 : 1,
      clothing: 1,
      vehicle: 1,
    };
  }

  // How wide a net they can throw, given what they actually have.
  get descriptionStrength() {
    let s = 0;
    if (this.known.build) s += 0.10;
    if (this.known.clothing) s += 0.20;
    if (this.known.vehicle) s += 0.30;
    if (this.known.prints) s += 0.15;
    if (this.known.face) s += 0.40;
    return Math.min(1, s);
  }

  // Shedding lines. Each of these is a thing you DO, and each needs something
  // you had the sense to bring.
  swapCar() { this.known.vehicle = 0; this.plateSwapped = false; }
  swapPlates() {
    if (!this.kit.plates || this.plateSwapped) return false;
    this.plateSwapped = true; this.known.vehicle = 0; return true;
  }
  changeClothes() {
    if (!this.kit.change) return false;
    this.kit.change = false;              // one change, that is what you bought
    this.known.clothing = 0; return true;
  }
  maskOn(on) {
    if (!this.kit.mask) return false;
    this.wearingMask = on; return true;
  }

  // A card payment is a pin in a map with a timestamp on it. Cash is not.
  buy(cost, withCard, x, y) {
    if (!withCard) {
      if (this.cash < cost) return false;
      this.cash -= cost; return true;
    }
    if (!this.card) return false;
    this.pings.push({ x, y, t: this.t });
    // if they know who you are, they are watching the account in real time
    if (this.identified) {
      this.lastPing = { x, y };
      this.wanted = Math.min(1, this.wanted + 0.22);
    }
    return true;
  }

  eat() {
    if (this.supplies <= 0) return false;
    this.supplies--;
    this.food = Math.min(1, this.food + 0.55);
    this.water = Math.min(1, this.water + 0.55);
    return true;
  }

  update(dt, world) {
    this.t += dt;
    const { seen, hidden, resting, px, py } = world;

    // ---- the scene works itself out whether you are there or not ----
    if (this.scene) {
      this.scene.t += dt;
      // NOTHING happens here until somebody arrives. No units, no statements,
      // no prints, no description - the clock on the investigation is the
      // number of people standing in the shop, not the time since you left it.
      const units = world.sceneUnits || 0;
      if (units > 0) this.responded = true;
      this.sceneUnits = units;
      if (this.responded && units > 0) {
        // two units work it faster than one, but not twice as fast - somebody
        // still has to take each statement in turn
        const rate = 0.022 * (1 + Math.min(2, units - 1) * 0.55);
        this.sceneWork = Math.min(1, this.sceneWork + dt * rate);
        // canvassing: each witness is a statement, and statements are what
        // produce a description of a PERSON rather than a set of prints
        if (this.canvassed < this.witnesses) {
          this.canvassT = (this.canvassT || 0) + dt * units;
          if (this.canvassT > 9) { this.canvassT = 0; this.canvassed++; }
        }
        const w = this.sceneWork;
        if (this.pending) {
          // witnesses first - what you looked like and what you drove
          // These three come out of people's mouths. No statements, no lines -
          // which is why an empty street is worth more than any piece of kit.
          if (this.canvassed >= 1) this.learn('build');
          if (this.canvassed >= 2) this.learn('clothing');
          if (this.canvassed >= 3) this.learn('vehicle');
          // then the lab, which is where a face or a print becomes a name
          if (w > 0.55) this.learn('face');
          if (w > 0.78) this.learn('prints');
        }
      }
    }

    // ---- identity ----
    if (!this.identified && (this.known.face || this.known.prints)) {
      this.identified = true;
      this.newlyIdentified = true;
    }

    // ---- pressure ----
    // Being seen and being findable are different things. A strong description
    // means every patrol in the borough is looking for something specific.
    // Cooling is SLOW. It was 0.028 a second, which took a full-blown
    // manhunt to nothing in about half a minute of standing in a stairwell.
    // Going to ground has to be a commitment measured in minutes.
    const push = seen ? 0.055 + this.descriptionStrength * 0.05 : -0.004;
    const cool = hidden ? -(0.0055 + (resting ? 0.0065 : 0)) : 0;
    this.wanted = clamp01(this.wanted + (push + cool) * dt * (seen ? 1 : 1));
    if (this.identified) this.wanted = Math.max(this.wanted, 0.18);

    // ---- the cordon ----
    // They shut the bridges first, then the arteries. It follows the wanted
    // level with a lag, so it keeps tightening for a while after you have gone
    // to ground - which is why running early is worth more than running well.
    const wantCordon = this.wanted * (this.identified ? 1 : 0.7);
    this.cordon += (wantCordon - this.cordon) * Math.min(1, dt * 0.10);

    // ---- the house ----
    if (this.identified && !this.houseRaided && this.wanted > 0.3) {
      this.houseT = (this.houseT || 0) + dt;
      if (this.houseT > 45) { this.houseRaided = true; this.houseJustRaided = true; }
    }

    // ---- needs ----
    // Slow enough that they are never the thing that kills you, fast enough
    // that they are the reason you cannot simply park and wait.
    const work = resting ? 0.35 : 1;
    this.food = clamp01(this.food - dt * 0.0034 * work);
    this.water = clamp01(this.water - dt * 0.0052 * work);
    this.energy = clamp01(this.energy + (resting ? dt * 0.020 : -dt * 0.0042));
    if (this.food <= 0 || this.water <= 0) this.energy = clamp01(this.energy - dt * 0.02);
    this.exhausted = this.energy < 0.18;

    // ---- getting clear ----
    // Not a timer. The response has to actually collapse, which means being
    // out of sight for long enough that there is nothing left to look for.
    // Getting clear is not a moment, it is a stretch of time with nothing
    // happening. The response has to stay collapsed - one glimpse of you resets
    // it, which is why the last few minutes are the worst ones.
    if (this.wanted <= 0.06) this.clearT = (this.clearT || 0) + dt;
    else this.clearT = 0;
    const needTime = this.identified ? 420 : 210;
    const needHold = this.identified ? 90 : 55;
    if (!this.won && this.clearT >= needHold && this.t > needTime) {
      this.won = true;
      this.winReason = this.identified ? 'YOU WERE NEVER FOUND' : 'THEY LOST YOU';
    }
    void px; void py;
  }

  // How far the description has actually travelled. Build alone circulates
  // in the borough it happened in; it takes a real manhunt to get a face on
  // every screen in the city.
  reach() {
    if (this.wanted > 0.72 || this.identified) return 'city';
    if (this.known.build || this.known.clothing || this.known.vehicle) return 'borough';
    return 'none';
  }

  // Would a member of the public looking straight at you think it was them?
  // Never certainty - it is somebody matching a description they half
  // remember from a screen, which is exactly why it produces a question.
  publicMatch(w) {
    let m = 0;
    if (this.known.build) m += 0.25;
    if (this.known.clothing && !w.changed) m += 0.40;
    if (this.known.face && !w.masked) m += 0.75;
    if (this.known.vehicle && w.inCrimeCar) m += 0.55;
    return m;
  }

  // Somebody calls it in.
  addTip(x, y, car) {
    this.tips.push({ x, y, car: !!car, t: this.t });
    if (this.tips.length > 6) this.tips.shift();
    this.newTip = { x, y, car: !!car };
  }

  learn(line) {
    if (!this.pending || !this.pending[line] || this.known[line]) return;
    this.known[line] = 1;
    this.justLearned = line;
  }

  get lines() {
    return LINES.map(l => ({ id: l, known: !!this.known[l] }));
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
