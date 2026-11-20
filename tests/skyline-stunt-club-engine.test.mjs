import assert from "node:assert/strict";
import {
  createGame,
  advanceFrame,
  tick,
  startRoute,
  reset,
  beacons,
  courses,
} from "../games/skyline-stunt-club/engine.js";
const drive = (s, keys, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) tick(s, new Set(keys), 1 / 60);
};
let s = createGame();
startRoute(s);
drive(s, ["w"], 3.7);
assert.equal(s.route.success, true);
assert.equal(s.landings, 1);
assert.ok(s.records[0] > 3 && s.records[0] < 4);
console.log(
  "PASS first flight completed using only throttle:",
  s.records[0].toFixed(3),
  "seconds,",
  s.rep,
  "rep",
);
const persisted = createGame(
  JSON.parse(
    JSON.stringify({
      rep: s.rep,
      best: s.best,
      landings: s.landings,
      records: s.records,
      collected: [...s.collected],
    }),
  ),
);
assert.equal(persisted.records[0], s.records[0]);
assert.equal(persisted.collected.size, 1);
assert.equal(persisted.landings, 1);
console.log("PASS progress and course records restore");
function replay(activeFrames, course) {
  const state = createGame();
  const log = [];
  startRoute(state, course);
  for (const seconds of activeFrames) {
    advanceFrame(state, new Set(["w"]), seconds);
    log.push(...state.events.splice(0));
  }
  return { car: state.car, route: state.route, rep: state.rep, log };
}
const constantFrames = (fps) => Array(4 * fps).fill(1 / fps);
const unevenFrames = Array.from({ length: 40 }, () => [0.013, 0.087]).flat();
for (const course of [0, 2]) {
  const at60 = replay(constantFrames(60), course);
  assert.deepEqual(replay(constantFrames(15), course), at60);
  assert.deepEqual(replay(constantFrames(144), course), at60);
  assert.deepEqual(replay(unevenFrames, course), at60);
  assert.deepEqual(replay([1.6, 0.4, 1, 1], course), at60);
  if (course === 0) {
    assert.equal(at60.route.success, true);
    assert.deepEqual(at60.log.map(e => e.type), ["reset", "jump", "land", "beacon", "gate", "finish"]);
  } else {
    assert.equal(at60.route.index, 1);
    assert.ok(Math.abs(at60.route.remaining - 146) < 1e-8);
  }
}
console.log("PASS identical movement, score, clock and event sequence at 15, 60, 144, uneven and stalled frames");
const fall = createGame();
Object.assign(fall.car, { x: 18.95, z: 0, a: Math.PI / 2, speed: 10 });
drive(fall, [], 0.12);
assert.equal(fall.landings, 0);
console.log("PASS edge step does not award a stunt landing");
const missedDeck = createGame();
Object.assign(missedDeck.car, { x: 18.95, z: 7, a: Math.PI / 2, speed: 18 });
drive(missedDeck, ["w"], 1.5);
assert.equal(missedDeck.totalFalls, 1, "A car below the deck must fall past the adjacent roof");
assert.equal(missedDeck.landings, 0);
assert.equal(missedDeck.rep, 0);
assert.ok(Math.abs(missedDeck.car.x - missedDeck.checkpoint.x) < 1);
console.log("PASS missed jump recovers without snapping up through a roof");
const coasting = createGame();
coasting.car.speed = 25;
tick(coasting, new Set(["w"]), 1 / 60);
assert.ok(coasting.car.speed < 25 && coasting.car.speed > 24,
  "Releasing boost must coast down instead of losing seven speed units in a frame");
const spin = createGame();
drive(spin, ["w"], 1.9);
drive(spin, ["w", "d"], 1.6);
assert.ok(spin.landings >= 1);
assert.ok(spin.best > 180);
console.log("PASS airborne steering produces scored spin:", spin.best);
const limits = createGame({
  rep: -1,
  best: Infinity,
  landings: NaN,
  livery: 3,
  records: { 0: -1, 1: "bad" },
  collected: [-1, 8, 2],
});
assert.equal(limits.rep, 0);
assert.equal(limits.best, 0);
assert.equal(limits.livery, 0);
assert.deepEqual(limits.records, {});
assert.deepEqual([...limits.collected], [2]);
console.log("PASS invalid saves sanitized and locked livery rejected");
const restart = createGame();
restart.checkpoint = { x: 40, z: 10, a: 2 };
startRoute(restart, 2);
assert.equal(restart.car.x, 9);
assert.equal(restart.car.z, 7);
assert.equal(restart.route.remaining, 150);
console.log("PASS course retry always returns to fair clubhouse start");
const timer = createGame();
startRoute(timer, 0);
drive(timer, [], 31);
assert.equal(timer.route.done, true);
assert.equal(timer.route.success, false);
assert.equal(timer.route.remaining, 0);
console.log("PASS timeout returns to free roam without false success");
const late = createGame();
startRoute(late);
late.route.remaining = 0.001;
Object.assign(late.car, { x: beacons[0].x, z: beacons[0].z + 3.15, speed: 18 });
tick(late, new Set(["w"]), 1 / 60);
assert.equal(late.route.success, false, "A checkpoint reached after the deadline must not finish a run");
assert.equal(late.records[0], undefined);
assert.equal(late.collected.has(0), true, "Free roam resumes when the deadline passes");
console.log("PASS sub-frame course deadline and free-roam continuation");
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function go(s, x, z) {
  let t = 0;
  while (
    Math.hypot(s.car.x - x, s.car.z - z) > 1.25 &&
    t < 20 &&
    !s.route.done
  ) {
    const c = s.car,
      dist = Math.hypot(x - c.x, z - c.z),
      err = norm(Math.atan2(x - c.x, -(z - c.z)) - c.a);
    const keys = new Set();
    if (err > 0.04) keys.add("d");
    if (err < -0.04) keys.add("a");
    const target = Math.abs(err) > 0.65 ? 3 : dist < 5 ? 5 : 10;
    if (c.speed < target) keys.add("w");
    if (c.speed > target + 0.2) keys.add(" ");
    tick(s, keys, 1 / 60);
    t += 1 / 60;
  }
  return t;
}
function sector(b) {
  return b.z < -23
    ? "N"
    : b.z > 23
      ? "S"
      : b.x > 27
        ? "E"
        : b.x < -27
          ? "W"
          : "C";
}
function center(s, from) {
  if (from === "N") {
    go(s, 0, -36);
    go(s, 0, -20);
  }
  if (from === "S") {
    go(s, 0, 36);
    go(s, 0, 20);
  }
  if (from === "E") {
    go(s, 42, 0);
    go(s, 24, 0);
  }
  if (from === "W") {
    go(s, -42, 0);
    go(s, -24, 0);
  }
  go(s, 0, 0);
}
function destination(s, b) {
  const sec = sector(b);
  if (sec === "N") {
    go(s, 0, -20);
    go(s, 0, -36);
  }
  if (sec === "S") {
    go(s, 0, 20);
    go(s, 0, 36);
  }
  if (sec === "E") {
    go(s, 24, 0);
    go(s, 42, 0);
  }
  if (sec === "W") {
    go(s, -24, 0);
    go(s, -42, 0);
  }
  go(s, b.x, b.z);
}
for (const course of [1, 2]) {
  startRoute(s, course);
  let prev = "C";
  for (const i of courses[course].path) {
    const b = beacons[i],
      sec = sector(b);
    if (prev !== sec) {
      center(s, prev);
      destination(s, b);
    } else go(s, b.x, b.z);
    prev = sec;
  }
  console.log(
    "COURSE",
    course,
    JSON.stringify({
      index: s.route.index,
      success: s.route.success,
      remaining: s.route.remaining,
      falls: s.totalFalls,
      position: [s.car.x, s.car.z],
    }),
  );
  assert.equal(
    s.route.success,
    true,
    "Bridge-driving controller must complete " + courses[course].name,
  );
}
console.log("ALL ENGINE TESTS PASSED");
