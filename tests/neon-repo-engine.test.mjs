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
test("malformed or absent career storage safely becomes a new career", () => {
  const a = makeState(null);
  assert.equal(a.career.cash, 0);
  assert.equal(a.career.jobs, 0);
  assert.deepEqual(a.career.records, {});
});
