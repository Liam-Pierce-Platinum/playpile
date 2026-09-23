// =====================================================================
// NASCAR :: race.js - THE RACE ITSELF
// =====================================================================
//
// One race, with no three.js anywhere in it. main.js draws what this
// says is happening and feeds it the player's pedals; tools/race.mjs
// runs the same object at a hundred times real speed with no browser and
// prints the result. They are THE SAME RACE - the running order that
// comes out of the tool is the running order you would have got by
// sitting through it, which is the only way a tool is worth anything.
//
// What a race is, in this order:
//
//   PACE LAPS    NASCAR starts rolling. The field circulates two abreast
//                behind the pace car at fifty-odd miles an hour, which
//                means everybody is ALREADY IN THE DRAFT when the green
//                drops - the start of a superspeedway race is a
//                forty-car pack, not a drag race.
//   GREEN        flat out. The running order is by progress, measured as
//                laps plus metres, and it changes constantly because the
//                air keeps handing the lead to whoever is behind.
//   THE CAUTION  somebody spins, or a car stops on the track. The yellow
//                comes out, everybody slows to pace speed, pit road
//                opens, the field closes back up, and the race restarts
//                with the pack bunched again. This is the single biggest
//                reason NASCAR looks the way it does and it is why a
//                thirty-second lead is worth nothing.
//   PIT STOPS    fuel, four tyres, a round of wedge, and the crew pulling
//                a fender off a tyre. The robots come in for fuel, for
//                worn rubber or for damage; you come in by driving down
//                the pit road.
//   THE FINISH   white flag, chequered flag, and a results table.
import { Car, TUNE, TYRES } from './stock.js';
import { Runner, collide, enforceWalls } from './world.js';
import { Driver, lanePlan } from './ai.js';
import { airflow } from './draft.js';
import { Damage } from './damage.js';
import { field } from './field.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const PHASE = { PACE: 'pace', GREEN: 'green', CAUTION: 'caution', FINISHED: 'finished' };

/** how long the crew take, in seconds */
const SERVICE = {
  fuel: 0.28,            // s per kg
  tyres: 11.5,           // four of them, jacks included
  twoTyres: 7.0,
  fender: 4.0,           // pulling the metal off a tyre
  wedge: 1.5,
};

export class Race {
  /**
   * @param track  a buildOval()
   * @param opts   { cars, laps, skill, playerAt, paceLaps, cautions }
   */
  constructor(track, opts = {}) {
    this.track = track;
    this.laps = opts.laps || 20;
    this.cars = clamp(opts.cars || 20, 2, 40);
    this.skill = opts.skill === undefined ? 0.97 : opts.skill;
    this.cautions = opts.cautions !== false;
    this.paceLaps = opts.paceLaps === undefined ? 1 : opts.paceLaps;
    this.playerAt = opts.playerAt === undefined ? 0 : opts.playerAt;
    this.hasPlayer = opts.hasPlayer !== false;
    // ENDURANCE. Liam: "add in a endurance mode for hundreds of laps". A
    // long race is cut into STAGES with a caution at the end of each, the
    // way the real ones are - it gives four hundred laps a shape, it
    // bunches the field up three times, and it is where the strategy lives.
    this.stages = opts.stages || [];
    this.stageDone = [];
    // WHO LED, AND WHO LED THE MOST, because a championship pays for both.
    this.ledLaps = {};                 // car number -> laps led
    this.lastLeader = null;
    // the driver's own call: P on the wheel. The crew are told, the board
    // goes out, and it is still the driver who has to get it down pit road.
    this.playerCall = false;
    this.clock = 0;
    this.phase = PHASE.PACE;
    this.phaseSince = 0;
    this.messages = [];             // for the HUD: ['CAUTION', 'GREEN GREEN GREEN', ...]
    this.events = [];               // structured, for the tools
    this.cautionCount = 0;
    this.finished = [];
    this.build(opts);
  }

  build(opts) {
    const tr = this.track;
    const entries = field(this.playerAt).slice(0, this.cars);
    // the grid: the starting order is the entry order, which stands in for
    // qualifying. The best cars start at the front.
    const order = entries.slice().sort((a, b) => b.pace - a.pace || a.i - b.i);
    // ...except the player, who is put where the menu asked
    if (this.hasPlayer) {
      const p = order.findIndex((e) => e.player);
      const want = clamp(opts.startAt === undefined ? Math.floor(this.cars / 2) : opts.startAt, 0, this.cars - 1);
      order.splice(want, 0, order.splice(p, 1)[0]);
    }
    const slots = tr.gridSlots(this.cars);

    // ONE SPEED PLAN PER SKILL LEVEL, shared: it is a few thousand square
    // roots per lane and there is no reason for forty cars to each do them.
    this.plans = new Map();
    this.runners = [];
    this.drivers = [];
    order.forEach((e, k) => {
      const car = new Car();
      car.T = { ...TUNE, finalDrive: tr.spec.finalDrive };
      car.fitTyres('sticker', 78);
      car.fuel = TUNE.fuelMax;
      const r = new Runner(car, tr, e);
      const s = slots[k];
      r.place(s.x, s.z, s.h);
      car.setHome(s.x, s.z, s.h);
      car.gear = 2;
      // rolling start: everybody is already doing pace speed
      const v = 24;
      car.vx = Math.sin(s.h) * v; car.vz = Math.cos(s.h) * v;
      for (const w of car.wheels) w.spin = v / car.T.wheelRadius;
      r.damage = new Damage(r);
      r.grid = k;
      r.pos = k + 1;
      r.stops = 0;
      r.pitted = false;
      r.stillFor = 0;
      this.runners.push(r);

      // the driver. The player's car gets one too, so that tools can drive
      // it and so that the pace laps work the same for everybody.
      const skill = clamp(this.skill * e.pace, 0.85, 1);
      const key = skill.toFixed(3);
      if (!this.plans.has(key)) this.plans.set(key, lanePlan(tr, car.T, skill));
      const d = new Driver(r, this.plans.get(key), skill, {
        // a fixed pseudo-random per entry: the same driver has the same
        // patience every week, and no two of them have the same
        groove: e.groove, aggression: e.nerve,
        rnd: () => ((Math.sin(e.number * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1,
      });
      d.stall = k;                                   // your pit box is your grid slot
      d.paceLat = s.lat;                             // hold your column on the pace laps
      r.ai = d;                                      // so drivers can read each other and go with a move
      this.drivers.push(d);
    });
    this.player = this.hasPlayer ? this.runners.find((r) => r.entry.player) : null;
    this.playerDriver = this.player ? this.drivers[this.runners.indexOf(this.player)] : null;
    this.updateOrder();
    this.leader = this.runners[0];
  }

  /** the running order, by how far round the race each car is */
  updateOrder() {
    const live = this.runners.filter((r) => !r.out);
    live.sort((a, b) => b.progress - a.progress);
    const out = this.runners.filter((r) => r.out).sort((a, b) => b.progress - a.progress);
    this.order = live.concat(out);
    this.order.forEach((r, k) => { r.pos = k + 1; });
    this.leader = this.order[0];
    return this.order;
  }

  say(msg) { this.messages.push({ t: this.clock, msg }); this.events.push({ t: this.clock, type: 'msg', msg }); }

  setPhase(p) {
    this.phase = p;
    this.phaseSince = this.clock;
  }

  /**
   * ONE TICK. `playerInput` is the pedals and the wheel; if it is null the
   * player's car is driven by its own robot, which is how the tools run a
   * whole field and how the pace laps work.
   */
  step(dt, playerInput = null) {
    const tr = this.track;
    this.clock += dt;
    this.messages.length = 0;

    // A RETIRED CAR IS NOT STILL CRASHING. Its Runner.step never runs
    // again, so the contact it was having at the moment it retired stayed
    // in its impacts list - and everything that reads that list read the
    // same forty-metre-a-second impact every frame for the rest of the
    // afternoon. A hundred and fifty thousand crashes, all of them one
    // array nobody emptied.
    for (const r of this.runners) if (r.out && r.impacts.length) r.impacts.length = 0;

    // ---- THE AIR, first: everything else depends on it -------------------
    airflow(this.runners, tr.length);

    const green = this.phase === PHASE.GREEN;
    const paceSpeed = tr.spec.pitLimit * 1.35;

    // ---- every car decides what to do ------------------------------------
    for (let k = 0; k < this.runners.length; k++) {
      const r = this.runners[k], d = this.drivers[k];
      if (r.out) continue;
      let input;
      if (r === this.player && playerInput) {
        input = playerInput;
        // the player's pit stop is handled by driving in, not by a robot
        this.playerPit(r, dt);
      } else {
        // THE FIELD CLOSES UP UNDER YELLOW. The leader runs at pace speed
        // and everybody else runs faster until they are on somebody's
        // bumper, which is exactly how a real field packs up behind the
        // pace car - and without it a caution changes nothing at all.
        const lead = r === this.leader;
        input = d.think(dt, this.runners, {
          go: green,
          clock: this.clock,
          paceSpeed: lead ? paceSpeed : paceSpeed * 1.45,
          service: this.service(r, d),
          onService: (rr) => this.serviced(rr),
        });
        if (input.reset) this.recover(r, !!(d.pitting || d.pitPhase));
      }
      r.step(dt, input, this.clock);
    }

    collide(this.runners);
    enforceWalls(this.runners);

    // ---- what the contacts did -------------------------------------------
    for (const r of this.runners) {
      if (r.out) continue;
      for (const imp of r.impacts) r.damage.impact(imp);
      r.damage.step(dt);
      if (r.damage.messages.length) {
        if (r === this.player) for (const m of r.damage.messages) this.say(m);
        r.damage.messages.length = 0;
      }
    }

    // ---- who is still in it ----------------------------------------------
    //
    // A CAR IN ITS PIT BOX IS NOT A CAR STOPPED ON THE RACETRACK, and this
    // used to be decided by geometry alone - r.inPit, which is a guess
    // about where the pit road is. On a track whose pit road does not line
    // up with the stalls to the metre the guess says "grass", and since a
    // stop takes thirteen seconds and this timer fires at twelve, EVERY
    // CAR IN THE FIELD was retired by the wrecker the first time it came
    // in for tyres. Nobody completed a pit stop on those tracks at all.
    //
    // So ask the man doing it instead: his driver knows he is in the
    // middle of a stop, on any track, whatever the survey says.
    for (let k = 0; k < this.runners.length; k++) {
      const r = this.runners[k], dr = this.drivers[k];
      if (r.out) continue;
      const servicing = dr && (dr.pitting || dr.pitPhase);
      if (r.car.speed < 2.5 && !r.inPit && !servicing) r.stillFor += dt; else r.stillFor = 0;
      if (r.damage.terminal || r.stillFor > 12) {
        r.out = true;
        r.outWhy = r.damage.terminal ? 'crash' : 'stopped';
        this.say('CAR ' + r.entry.number + ' IS OUT - ' + r.outWhy.toUpperCase());
        this.events.push({ t: this.clock, type: 'out', car: r.entry.number, why: r.outWhy });
        if (this.cautions && this.phase === PHASE.GREEN) this.throwCaution(r);
        // AND THE WRECKER TAKES IT AWAY. A car left where it stopped is a
        // stationary obstacle on a 190 mph racetrack for the rest of the
        // afternoon, and the rest of the field will find it.
        const off = this.track.pos(r.dist, this.track.innerEdge + 14);
        r.car.x = off.x; r.car.z = off.z;
        r.car.vx = 0; r.car.vz = 0; r.car.yawRate = 0;
      }
    }

    // ---- the robots decide whether to come in ----------------------------
    if (this.phase !== PHASE.FINISHED) this.pitCalls();

    // ---- the stages, and who is leading ----------------------------------
    this.countLaps();
    this.stageCheck();

    // ---- the flags --------------------------------------------------------
    this.updateOrder();
    this.flags();
    return this.order;
  }

  /**
   * How long this car's stop takes: fuel plus whatever else it needs. A
   * splash of fuel is eight seconds, four tyres is twelve, and pulling a
   * fender off a tyre is four more on top.
   */
  service(r, d) {
    const car = r.car;
    // THE CREW WORK AT THE SAME TIME. Two tyre changers go round the car
    // while the fuel man is on the back of it, so a full tank and four
    // tyres is thirteen seconds, not the twenty-five it takes to do one and
    // then the other. Adding them up made every green-flag stop cost most
    // of a lap more than it should and turned a race into a queue.
    let t = 2.0;
    let work = (TUNE.fuelMax - car.fuel) * SERVICE.fuel;
    const worn = Math.min(...car.wheels.map((w) => w.wear));
    if (worn < 0.75 || r.damage.tyre.some((x) => x !== 'ok')) work = Math.max(work, SERVICE.tyres);
    t += work;
    if (r.damage.panels.some((p) => p.spec.rubs !== undefined && p.worst > 0.24)) t += SERVICE.fender;
    return t;
  }

  /** the crew have finished: put right what they can */
  serviced(r) {
    r.car.fuel = TUNE.fuelMax;
    r.car.fitTyres('sticker', 70);
    r.damage.mend(false);
    r.stops++;
    r.pitted = true;
    this.events.push({ t: this.clock, type: 'stop', car: r.entry.number, lap: r.lap });
  }

  /**
   * THE PLAYER'S STOP. There is no menu: you drive onto the pit road,
   * you keep it under the speed limit, you stop in your box and the crew
   * take the car. Exactly what the robots do, through the same road.
   */
  playerPit(r, dt) {
    const tr = this.track, P = tr.pit;
    const d = this.playerDriver;
    if (!r.inPit) { r.pitTimer = 0; r.onBox = false; return; }
    const stall = P.stallPose(d.stall);
    const near = Math.abs(P.rel(r.dist) - stall.at) < 5 && Math.abs(r.lat - P.box) < 3.5;
    if (near && r.car.speed < 1.2) {
      r.onBox = true;
      r.pitTimer = (r.pitTimer || 0) + dt;
      const need = this.service(r, d);
      r.pitNeed = need;
      r.stopT = clamp(r.pitTimer / need, 0.001, 1);
      if (r.pitTimer >= need) {
        this.serviced(r);
        r.pitTimer = 0;
        r.stopT = 0;
        r.onBox = false;
        this.say('THAT IS ALL FOUR - GO GO GO');
      }
    } else if (!near) {
      r.pitTimer = 0;
      r.stopT = 0;
      r.onBox = false;
    }
  }

  /**
   * A LAP LED IS COUNTED WHEN IT IS COMPLETED, not when somebody is in
   * front at some instant - being ahead halfway down the backstretch is
   * not leading a lap, and counting it that way hands the point to whoever
   * happened to be first past a camera.
   */
  countLaps() {
    const lead = this.leader;
    if (!lead) return;
    if (this.lastLeader !== lead) this.lastLeader = lead;
    const n = lead.entry ? lead.entry.number : 0;
    const lap = lead.lap;
    this.ledAt = this.ledAt || {};
    if (this.ledAt[n] !== lap) {
      this.ledAt[n] = lap;
      this.ledLaps[n] = (this.ledLaps[n] || 0) + 1;
    }
  }

  /** who led, and who led the most - for the championship */
  ledSummary() {
    const led = Object.keys(this.ledLaps).map(Number);
    let most = null, best = 0;
    for (const n of led) if (this.ledLaps[n] > best) { best = this.ledLaps[n]; most = n; }
    return { led, ledMost: most, laps: { ...this.ledLaps } };
  }

  /** the end of a stage: a caution, and everybody comes in */
  stageCheck() {
    if (!this.stages.length || this.phase !== PHASE.GREEN) return;
    const lap = this.leader ? this.leader.lap : 0;
    for (let i = 0; i < this.stages.length; i++) {
      if (this.stageDone[i] || lap < this.stages[i]) continue;
      this.stageDone[i] = true;
      this.throwCaution('END OF STAGE ' + (i + 1));
      this.messages.push('STAGE ' + (i + 1) + ' COMPLETE');
    }
  }

  /** the robots' strategy: fuel first, then rubber, then bodywork */
  pitCalls() {
    const toGo = this.laps - (this.leader ? this.leader.lap : 0);
    for (let k = 0; k < this.runners.length; k++) {
      const r = this.runners[k], d = this.drivers[k];
      if (r.out || r === this.player || d.pitting || d.pitPhase) continue;
      const car = r.car;
      // how many laps the fuel will do, at the rate this car is using it
      // WHAT THIS CAR IS REALLY USING, from its own last few laps; the
      // constant is only the guess it runs on before it has completed one.
      // It is padded 6% because a car that comes in a lap early loses two
      // seconds and a car that comes in a lap late loses the race.
      const perLap = (r.fuelPerLap || this.track.length * 0.00034) * 1.06;
      const fuelLaps = car.fuel / perLap;
      const worn = Math.min(...car.wheels.map((w) => w.wear));
      // MUST means must: the stop has to be called with enough in the cell
      // to reach the pit entry, which on a two-and-a-half mile track is
      // most of a lap away.
      const mustFuel = fuelLaps < 3.5;
      const wantFuel = fuelLaps < toGo - 1 && fuelLaps < 12;
      const wantTyres = worn < 0.38;
      const wantBody = r.damage.needsPit;
      // UNDER YELLOW EVERYBODY COMES IN, because a stop under caution costs
      // you nothing - the whole field is doing fifty miles an hour. That one
      // rule is most of NASCAR's strategy and it falls out of two lines.
      const yellow = this.phase === PHASE.CAUTION;
      const worth = mustFuel || (yellow && (wantFuel || wantTyres || wantBody))
                 || (this.phase === PHASE.GREEN && (wantFuel || wantTyres || wantBody) && toGo > 3);
      if (!worth) continue;
      // ...but never on the last lap, unless the tank is actually empty
      if (toGo <= 1 && !mustFuel) continue;
      d.pitting = true;
    }
  }

  /** a car that spun and stopped, put back on the racing surface */
  recover(r, onPitRoad = false) {
    const tr = this.track;
    // A CAR RECOVERED OUT OF THE PIT LANE GOES BACK IN THE PIT LANE. Putting
    // it on the racing surface instead would drop a stationary car into the
    // middle of a green-flag pack, and it would still owe the stop.
    const lane = onPitRoad ? tr.pit.centre(tr.pit.rel(r.dist + 10)) : null;
    const p = tr.pos(r.dist + 12, lane === null ? tr.halfWidth - 3 : lane);
    r.place(p.x, p.z, p.h);
    const v = onPitRoad ? Math.min(tr.pit.limit * 0.8, 10) : this.phase === PHASE.GREEN ? 30 : 18;
    r.car.vx = Math.sin(p.h) * v; r.car.vz = Math.cos(p.h) * v;
    r.car.gear = 3;
    for (const w of r.car.wheels) w.spin = v / r.car.T.wheelRadius;
  }

  throwCaution(why) {
    if (this.phase !== PHASE.GREEN) return;
    this.cautionCount++;
    this.setPhase(PHASE.CAUTION);
    this.say('CAUTION - CAUTION - CAUTION');
    this.events.push({ t: this.clock, type: 'caution', lap: this.leader ? this.leader.lap : 0 });
  }

  /** the flag stand */
  flags() {
    const lead = this.leader;
    if (!lead) return;
    if (this.phase === PHASE.PACE) {
      if (lead.lap >= this.paceLaps) {
        this.setPhase(PHASE.GREEN);
        this.say('GREEN GREEN GREEN');
        this.events.push({ t: this.clock, type: 'green', lap: lead.lap });
      }
      return;
    }
    if (this.phase === PHASE.CAUTION) {
      // three laps under yellow, then back to racing
      if (this.clock - this.phaseSince > this.cautionLength()) {
        this.setPhase(PHASE.GREEN);
        this.say('GREEN - WE ARE BACK RACING');
        this.events.push({ t: this.clock, type: 'restart', lap: lead.lap });
      }
      return;
    }
    if (this.phase === PHASE.GREEN) {
      if (lead.lap >= this.laps) {
        this.setPhase(PHASE.FINISHED);
        this.say('CHEQUERED FLAG');
        this.finished = this.order.slice();
        this.events.push({ t: this.clock, type: 'finish',
          order: this.finished.map((r) => r.entry.number) });
      } else if (lead.lap === this.laps - 1 && !this.saidWhite) {
        this.saidWhite = true;
        this.say('WHITE FLAG - ONE TO GO');
      }
    }
  }

  cautionLength() {
    // Long enough for the field to close up and for everybody to pit.
    //
    // A real caution is three or four laps, which at Daytona is four
    // minutes of watching cars do fifty-five miles an hour, and that is a
    // fine way to spend a Sunday afternoon and a terrible thing to put in a
    // video game. So it is one pace lap, capped at forty seconds - enough
    // for the pack to bunch and for a stop, and no longer.
    return Math.min(40, this.track.length / (this.track.spec.pitLimit * 1.35));
  }

  /**
   * Every stop happening right now, nearest to a point first - which is
   * how main.js decides which four of the forty pit boxes get a crew.
   */
  stopsInProgress(near) {
    const out = [];
    for (const r of this.runners) {
      if (r.out || !r.stopT) continue;
      out.push({ runner: r, t: r.stopT, pos: { x: r.car.x, y: r.y, z: r.car.z },
        yaw: r.car.yaw, colour: r.entry.livery.accent,
        d: near ? (r.car.x - near.x) ** 2 + (r.car.z - near.z) ** 2 : 0 });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  /** the gap from a car to the one in front, in seconds */
  gapAhead(r) {
    const k = this.order.indexOf(r);
    if (k <= 0) return 0;
    const ahead = this.order[k - 1];
    const d = ahead.progress - r.progress;
    return d / Math.max(12, (r.car.speed + ahead.car.speed) / 2);
  }

  /**
   * How far down the road the field is spread, in metres - measured over
   * the cars ON THE LEAD LAP.
   *
   * It used to be leader minus last car running, which is not a measure of
   * how close the racing is, it is a measure of how bad somebody's day
   * was: one car that pits four times and comes back fifty laps down puts
   * eighty kilometres into the number while the other eighteen are running
   * nose to tail. Once tyres and fuel started deciding races that stopped
   * being a rare case, and the reading went from "they race in a pack" to
   * "they are strung out over the whole track" without a single car on the
   * lead lap having moved.
   */
  get spread() {
    const live = this.order.filter((r) => !r.out);
    if (live.length < 2) return 0;
    const lead = live[0].lap;
    const onLap = live.filter((r) => r.lap >= lead - 1);
    const tail = onLap.length >= 2 ? onLap[onLap.length - 1] : live[1];
    return live[0].progress - tail.progress;
  }

  /** the results table */
  results() {
    return this.order.map((r, k) => ({
      pos: k + 1, number: r.entry.number, driver: r.entry.driver, sponsor: r.entry.sponsor,
      laps: r.lap, best: r.bestLap, out: r.out, why: r.outWhy, stops: r.stops,
      grid: r.grid + 1, player: !!r.entry.player,
      damage: +r.damage.severity.toFixed(2),
    }));
  }
}
