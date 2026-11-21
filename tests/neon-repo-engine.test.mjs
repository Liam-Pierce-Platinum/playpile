import test from "node:test";
import assert from "node:assert/strict";
import {
  makeState,
  acceptJob,
  interact,
  step,
  recover,
  VEHICLES,
  JOBS,
  BLOCKS,
  DEPOT,
  upgrade,
  route,
  HANDOVER_RADIUS,
  DISTRICT_EDGE,
} from "../games/neon-repo/engine.js";
const run = (s, input, secs) => {
  for (let i = 0; i < secs * 60; i++) step(s, input, 1 / 60);
};
test("all jobs and depot are accessible street positions", () => {
  for (const p of [...JOBS, DEPOT])
    assert.ok(
      !BLOCKS.some(
        (b) =>
          p.x > b.x - 25 &&
          p.x < b.x + b.w + 25 &&
          p.y > b.y - 25 &&
          p.y < b.y + b.h + 25,
      ),
    );
});
test("recovery changes handling and delivery rewards once", () => {
  const s = makeState();
  acceptJob(s, 1);
  s.car.x = s.job.x;
  s.car.y = s.job.y;
  assert.equal(interact(s), "collected");
  assert.equal(s.car.kind, "atlas");
  s.car.x = DEPOT.x;
  s.car.y = DEPOT.y;
  assert.equal(interact(s), "delivered");
  const cash = s.career.cash;
  assert.ok(cash > 600);
  assert.equal(interact(s), null);
  assert.equal(s.career.cash, cash);
});
test("a passing car cannot instantly collect a job", () => {
  const s = makeState();
  acceptJob(s, 0);
  s.car.x = s.job.x;
  s.car.y = s.job.y;
  s.car.speed = 200;
  assert.equal(interact(s), null);
});
test("traffic and wall collisions do not create negative health or invalid coordinates", () => {
  const s = makeState();
  acceptJob(s, 0);
  run(s, { throttle: 1, steer: 0.2 }, 90);
  assert.ok(s.car.health >= 5);
  for (const key of ["x", "y", "speed", "vx", "vy"])
    assert.ok(Number.isFinite(s.car[key]));
});
test("idle does not accelerate and pause freezes physics", () => {
  const s = makeState();
  acceptJob(s, 0);
  s.traffic = [];
  run(s, {}, 5);
  assert.equal(s.car.speed, 0);
  s.mode = "pause";
  const before = s.elapsed;
  run(s, { throttle: 1 }, 5);
  assert.equal(s.elapsed, before);
});
test("reset points a horizontal road car along the road", () => {
  const s = makeState();
  acceptJob(s, 0);
  s.car.x = 500;
  s.car.y = 800;
  recover(s);
  assert.equal(s.car.y, 760);
  assert.equal(s.car.angle, 0);
});
test("career upgrade spends once and caps at three", () => {
  const s = makeState({ cash: 10000 });
  for (let i = 0; i < 3; i++) assert.ok(upgrade(s, "tires"));
  assert.equal(upgrade(s, "tires"), false);
  assert.equal(s.career.cash, 6100);
});
test("vehicle fleet has meaningfully different handling", () => {
  assert.ok(VEHICLES.comet.max > VEHICLES.atlas.max * 1.4);
  assert.ok(VEHICLES.wren.turn > VEHICLES.atlas.turn * 1.5);
  assert.ok(VEHICLES.thunder.grip < VEHICLES.scout.grip * 0.65);
});
test("personal bests belong to a contract and destination pair", () => {
  const s = makeState();
  acceptJob(s, 0);
  s.car.x = s.job.x;
  s.car.y = s.job.y;
  interact(s);
  s.elapsed = 40;
  s.car.x = s.job.drop.x;
  s.car.y = s.job.drop.y;
  interact(s);
  assert.equal(s.career.records["0:0"].bestTime, 40);
  s.career.jobs = 3;
  s.mode = "board";
  acceptJob(s, 0);
  s.car.x = s.job.x;
  s.car.y = s.job.y;
  interact(s);
  s.elapsed = 25;
  s.car.x = s.job.drop.x;
  s.car.y = s.job.drop.y;
  interact(s);
  assert.equal(s.career.records["0:0"].bestTime, 40);
  assert.equal(s.career.records["0:1"].bestTime, 25);
  assert.equal(s.completed.personalBest, true);
});
test("switching cars puts the player in the actual recovery vehicle", () => {
  const s = makeState();
  acceptJob(s, 1);
  s.car.x = s.job.x - 60;
  s.car.y = s.job.y;
  interact(s);
  assert.equal(s.car.x, s.job.x);
  assert.equal(s.car.y, s.job.y);
  assert.equal(s.car.kind, "atlas");
});
test("live traffic collision damages bodywork with a cooldown", () => {
  const s = makeState();
  acceptJob(s, 0);
  s.car.speed = 200;
  s.car.vx = 200;
  s.traffic = [{ x: s.car.x + 25, y: s.car.y, speed: 0, angle: 0 }];
  step(s, { throttle: 1 }, 1 / 60);
  assert.equal(s.collisions, 1);
  assert.ok(s.car.health < 100);
  const health = s.car.health;
  step(s, { throttle: 1 }, 1 / 60);
  assert.equal(s.car.health, health);
});

function drivingAt(x, y, angle, speed, kind = "scout") {
  const s = makeState();
  acceptJob(s, 0);
  Object.assign(s.car, { x, y, kind, angle, speed,
    vx: speed * Math.cos(angle), vy: speed * Math.sin(angle) });
  s.traffic = [];
  return s;
}

test("all car bodies can overtake or pass oncoming traffic with a visible side gap", () => {
  for (const kind of Object.keys(VEHICLES)) {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 3]) {
      for (const oncoming of [false, true]) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const s = drivingAt(760 - dx * 50, 760 - dy * 50, angle, 200, kind);
        s.traffic = [{ x: 760 - dy * 31, y: 760 + dx * 31, speed: 50,
          angle: oncoming ? angle + Math.PI : angle, kind: "atlas" }];
        run(s, { throttle: 1 }, 0.5);
        assert.equal(s.collisions, 0);
        assert.equal(s.car.health, 100);
        assert.ok(s.car.speed >= 200);
      }
    }
  }
});

test("a car can pass beside a wall or slide along it without damaging its bodywork", () => {
  for (const angle of [0, 0.035]) {
    const s = drivingAt(900, 848, angle, 200, "atlas");
    run(s, { throttle: 1 }, 0.65);
    assert.equal(s.collisions, 0);
    assert.equal(s.car.health, 100);
    assert.ok(s.car.x > 1025);
    assert.ok(s.car.y + VEHICLES.atlas.width / 2 <= 860);
  }
});

test("true vehicle and wall impacts stop the car at the visible surface", () => {
  const wall = drivingAt(1000, 810, Math.PI / 2, 200);
  run(wall, { throttle: 1 }, 0.2);
  assert.equal(wall.collisions, 1);
  assert.match(wall.toast.text, /Wall/);
  assert.ok(wall.car.y <= 860 - VEHICLES.scout.length / 2);

  for (const angle of [0, Math.PI / 2, Math.PI]) {
    const s = drivingAt(700, 760, 0, 210);
    s.traffic = [{ x: 760, y: 760, angle, speed: 0, kind: "atlas" }];
    run(s, { throttle: 1 }, 0.25);
    assert.equal(s.collisions, 1);
    assert.match(s.toast.text, /Front hit/);
    assert.ok(s.car.health < 100);
    assert.ok(s.car.x < s.traffic[0].x);
  }
});

test("a driver at the district limit can reverse away without damage", () => {
  const s = drivingAt(115, 760, Math.PI, 180);
  run(s, { throttle: 1 }, 0.5);
  const limit = DISTRICT_EDGE + VEHICLES.scout.length / 2;
  assert.equal(s.car.x, limit);
  assert.equal(s.collisions, 0);
  assert.equal(s.car.health, 100);
  assert.match(s.toast.text, /District limit/);
  run(s, { throttle: -1 }, 0.5);
  assert.ok(s.car.x > limit + 10);
});

test("a moving driver can identify a real rear or side impact with a clear road ahead", () => {
  const rear = drivingAt(740, 760, 0, 60);
  rear.traffic = [{ x: 680, y: 760, angle: 0, speed: 160, kind: "scout" }];
  run(rear, {}, 0.3);
  assert.equal(rear.collisions, 1);
  assert.match(rear.toast.text, /Rear hit/);

  const side = drivingAt(740, 760, 0, 60);
  side.traffic = [{ x: 751, y: 710, angle: Math.PI / 2, speed: 160, kind: "scout" }];
  run(side, {}, 0.25);
  assert.equal(side.collisions, 1);
  assert.match(side.toast.text, /Side hit/);
});

test("traffic yields to a stopped driver and resumes once the lane clears", () => {
  const s = drivingAt(760, 760, 0, 0);
  const t = { x: 690, y: 760, angle: 0, speed: 80, kind: "scout" };
  s.traffic = [t];
  run(s, {}, 1.5);
  assert.equal(t.waiting, true);
  assert.ok(s.car.x - t.x >= VEHICLES.scout.length);
  assert.equal(s.car.health, 100);
  s.car.y += 40;
  run(s, {}, 1);
  assert.equal(t.waiting, false);
  assert.ok(t.x > 760);
});
test("malformed or absent career storage safely becomes a new career", () => {
  const a = makeState(null);
  assert.equal(a.career.cash, 0);
  assert.equal(a.career.jobs, 0);
  assert.deepEqual(a.career.records, {});
});

test("dispatch and recovered vehicles face the first GPS leg for each contract and destination", () => {
  function facesRoute(s) {
    const next = route(s)[1];
    const dx = next.x - s.car.x, dy = next.y - s.car.y;
    const forward = Math.cos(s.car.angle) * dx + Math.sin(s.car.angle) * dy;
    assert.ok(Math.abs(forward - Math.hypot(dx, dy)) < 0.001);
  }
  for (const jobs of [0, 3, 6]) for (let i = 0; i < JOBS.length; i++) {
    const s = makeState({ jobs });
    acceptJob(s, i);
    facesRoute(s);
    Object.assign(s.car, { x: s.job.x, y: s.job.y });
    assert.equal(interact(s), "collected");
    facesRoute(s);
  }
});

test("the handover zone rejects a car still sliding after braking", () => {
  const s = makeState();
  acceptJob(s, 0);
  Object.assign(s.car, { x: s.job.x, y: s.job.y, speed: 10, vx: 95 });
  assert.equal(interact(s), null);
  s.car.vx = 0;
  s.car.x = s.job.x + HANDOVER_RADIUS;
  assert.equal(interact(s), null);
  s.car.x -= 1;
  assert.equal(interact(s), "collected");
});

test("overtime pays once without a time bonus and the next contract starts clean", () => {
  const s = makeState();
  acceptJob(s, 0);
  run(s, {}, JOBS[0].time + 1);
  assert.equal(s.mode, "play");
  assert.ok(s.clock < 0);
  Object.assign(s.car, { x: s.job.x, y: s.job.y });
  assert.equal(interact(s), "collected");
  Object.assign(s.car, { x: s.job.drop.x, y: s.job.drop.y });
  assert.equal(interact(s), "delivered");
  assert.equal(s.completed.timeBonus, 0);
  assert.ok(s.completed.pay >= JOBS[0].pay);
  assert.equal(interact(s), null);
  Object.assign(s, { shake: 8, cooldown: 0.6, skids: [{ ttl: 7 }] });
  assert.ok(acceptJob(s, 1));
  assert.equal(s.clock, JOBS[1].time);
  assert.equal(s.car.health, 100);
  assert.equal(s.skids.length + s.shake + s.cooldown, 0);
  const reloaded = makeState(JSON.parse(JSON.stringify(s.career)));
  assert.equal(reloaded.career.jobs, 1);
  assert.equal(reloaded.career.records["0:0"].count, 1);
});
