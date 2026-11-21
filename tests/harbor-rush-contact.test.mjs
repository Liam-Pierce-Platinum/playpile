import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, makeContract, step, buildings } from '../games/harbor-rush/model.js';

function delivery(x, y, angle = 0, speed = 200) {
  const g = createGame();
  makeContract(g, 'fragile').stage = 'delivery';
  Object.assign(g.car, { x, y, a: angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  return g;
}
function advance(g, frames) {
  for (let i = 0; i < frames; i++) step(g, { throttle: true }, 1 / 60);
}
function traffic(g, y, speed = 0) {
  g.traffic = [{ x: 870, y, a: 0, speed, target: 0, loop: [{ x: 1000, y }] }];
}
test('Harbor courier can pass a wall or another vehicle with visible clearance', () => {
  const wall = delivery(buildings[0].x - 15, buildings[0].y + 30, Math.PI / 2);
  advance(wall, 20);
  assert.equal(wall.mission.cargo, 100);
  assert.equal(wall.car.hit, 0);
  const adjacent = delivery(800, 680);
  traffic(adjacent, 706);
  advance(adjacent, 30);
  assert.equal(adjacent.mission.cargo, 100);
  assert.equal(adjacent.car.hit, 0);
});
test('the port limit protects cargo, while physical traffic and wall hits cause damage', () => {
  for (const [x, y, a] of [[220,680,Math.PI],[2060,680,0],[700,180,-Math.PI/2],[700,2040,Math.PI/2]]) {
    const g = delivery(x,y,a);
    advance(g,45);
    assert.equal(g.mission.cargo,100);
    assert.equal(g.car.hit,0);
  }
  const car = delivery(800,680);
  traffic(car,680);
  advance(car,20);
  assert.ok(car.mission.cargo < 100);
  const wall = delivery(buildings[0].x - 55, buildings[0].y + 70);
  advance(wall,20);
  assert.ok(wall.mission.cargo < 100);
});
test('a rival must touch the courier to damage a delivery', () => {
  function trial(y) {
    const g = delivery(800,680,0,130);
    g.mission.type = 'rival';
    g.rival = { x: 800, y, target: { x: 1100, y }, a: 0, cooldown: 0 };
    advance(g,3);
    return g.mission.cargo;
  }
  assert.equal(trial(710),100);
  assert.equal(trial(698),92);
});
