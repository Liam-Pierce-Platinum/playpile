import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  makeContract,
  step,
  buyUpgrade,
  sanitizeSave,
  recover,
  buildings,
  routeTo,
} from "../games/harbor-rush/model.js";
const tick = (g, i, t) => {
  for (let n = 0; n < Math.ceil(t * 60); n++) step(g, i, 1 / 60);
};
test("complete pickup and delivery require low speed and reward only once", () => {
  const g = createGame();
  makeContract(g);
  Object.assign(g.car, g.mission.from, { vx: 0, vy: 0 });
  tick(g, {}, 1);
  assert.equal(g.mission.stage, "delivery");
  Object.assign(g.car, g.mission.to, { vx: 0, vy: 0 });
  tick(g, {}, 1);
  assert.equal(g.mission, null);
  assert.equal(g.save.deliveries, 1);
  const credits = g.save.credits;
  tick(g, {}, 3);
  assert.equal(g.save.credits, credits);
});
test("driving, braking and reverse work without losing finite physics", () => {
  const g = createGame();
  g.car.x = 1140;
  g.car.y = 1800;
  tick(g, { throttle: true }, 2);
  assert.ok(g.car.y < 1500);
  assert.ok(Math.hypot(g.car.vx, g.car.vy) > 200);
  tick(g, { brake: true }, 3);
  assert.ok(g.car.vy > 0);
  tick(g, { throttle: true, left: true, drift: true, boost: true }, 30);
  assert.ok(Number.isFinite(g.car.x) && Number.isFinite(g.car.y));
  assert.ok(g.car.x >= 155 && g.car.x <= 2110);
});
test("boost is bounded and recharges; upgrades cannot overdraft or exceed three", () => {
  const g = createGame({ credits: 10000 });
  g.car.x = 1140;
  g.car.y = 1800;
  tick(g, { throttle: true, boost: true }, 4);
  assert.ok(g.car.boost < 100 && g.car.boost >= 0);
  tick(g, {}, 20);
  assert.equal(g.car.boost, 100);
  for (let i = 0; i < 3; i++) assert.equal(buyUpgrade(g, "engine"), true);
  assert.equal(buyUpgrade(g, "engine"), false);
  assert.equal(g.save.engine, 3);
  const poor = createGame();
  assert.equal(buyUpgrade(poor, "grip"), false);
  assert.equal(poor.save.credits, 0);
});
test("collision keeps car out of buildings and damages fragile cargo", () => {
  const g = createGame();
  makeContract(g, "fragile");
  g.mission.stage = "delivery";
  const b = buildings[0];
  g.car.x = b.x - 18;
  g.car.y = b.y + 100;
  g.car.a = 0;
  g.car.vx = 250;
  tick(g, { throttle: true }, 0.3);
  assert.ok(g.car.x < b.x);
  assert.ok(g.mission.cargo < 100);
});
test("rival activates only after pickup and ends with delivery", () => {
  const g = createGame();
  makeContract(g, "rival");
  assert.equal(g.rival, null);
  Object.assign(g.car, g.mission.from, { vx: 0, vy: 0 });
  tick(g, {}, 1);
  assert.ok(g.rival);
  Object.assign(g.car, g.mission.to, { vx: 0, vy: 0 });
  tick(g, {}, 1);
  assert.equal(g.rival, null);
  assert.equal(g.save.deliveries, 1);
});
test("corrupt saves clamp and recovery always returns to accessible roads", () => {
  const save = sanitizeSave({
    credits: -300,
    engine: 999,
    grip: "bad",
    distance: Infinity,
  });
  assert.equal(save.credits, 0);
  assert.equal(save.engine, 3);
  assert.equal(save.grip, 0);
  const g = createGame();
  g.car.x = 380;
  g.car.y = 380;
  recover(g);
  assert.equal(g.car.x, 260);
  assert.equal(g.car.y, 240);
  const route = routeTo(g.car, { x: 2020, y: 680 });
  assert.deepEqual(route.at(-1), { x: 2020, y: 680 });
});
test("free-roam discoveries pay once and survive save reload", () => {
  const g = createGame();
  g.car.x = 260;
  g.car.y = 2000;
  tick(g, {}, 1);
  assert.equal(g.save.credits, 35);
  assert.equal(g.save.stamps, 1);
  tick(g, {}, 2);
  assert.equal(g.save.credits, 35);
  const loaded = createGame(g.save);
  loaded.car.x = 260;
  loaded.car.y = 2000;
  tick(loaded, {}, 1);
  assert.equal(loaded.save.credits, 35);
});
test("three mission types stay distinct and jobs do not force route checkpoints", () => {
  for (const type of ["standard", "fragile", "rival"]) {
    const g = createGame();
    const m = makeContract(g, type);
    assert.equal(m.type, type);
    assert.notDeepEqual(m.from, m.to);
    assert.equal("checkpoints" in m, false);
  }
});
