import test from 'node:test';
import assert from 'node:assert/strict';
import { ballContact, carsContact } from '../games/car-soccer/src/car-shape.js';
import { makeWorld, step } from '../games/car-soccer/src/physics.js';
import { BALL_R, GY, GT, W, H } from '../games/car-soccer/src/arena.js';

const pose = (body = 'octo', dir = 1, a = 0) => ({ x: 0, y: 600, body, dir, a });
function ballAt(car, x, y) {
  return {
    x: car.x + x * car.dir * Math.cos(car.a) - y * Math.sin(car.a),
    y: car.y + x * car.dir * Math.sin(car.a) + y * Math.cos(car.a),
  };
}
test('Turbo Goal allows the ball to clear the slope of a Bulldog hood and catches roof and tyres', () => {
  for (const dir of [-1, 1])
    for (const angle of [0, 0.42, Math.PI / 2, Math.PI]) {
      const car = pose('octo', dir, angle);
      assert.equal(ballContact(car, ballAt(car, 110, 91), BALL_R), null);
      assert(ballContact(car, ballAt(car, -42, -115), BALL_R));
      assert(ballContact(car, ballAt(car, 0, 113), BALL_R));
    }
  assert.equal(ballContact(pose('dart'), ballAt(pose('dart'), 0, 113), BALL_R), null);
  assert(ballContact(pose('brute'), ballAt(pose('brute'), 0, 121), BALL_R));
});

test('Turbo Goal separates a ball embedded at the centre and emits hits only for visible contact', () => {
  for (const [x, y, vx, vy, hit] of [
    [110, 91, -80, -80, false],
    [0, 113, 0, -80, true],
    [-42, -115, 0, 80, true],
  ]) {
    const w = makeWorld();
    w.cars.length = 1;
    Object.assign(w.cars[0], pose(), { grounded: false });
    Object.assign(w.ball, { x, y: 600 + y, vx, vy });
    step(w, [{}]);
    assert.equal(
      w.events.some((e) => e.type === 'hit'),
      hit,
    );
  }
  const c = pose(),
    embedded = ballContact(c, { x: c.x, y: c.y }, BALL_R);
  assert(embedded.depth > BALL_R && Math.abs(Math.hypot(embedded.nx, embedded.ny) - 1) < 1e-6);
});

test('Turbo Goal opposing cars meet at their bumpers and make airborne roof-to-tyre contact', () => {
  const a = pose();
  assert.equal(carsContact(a, { ...pose('octo', -1), x: 143 }), null);
  const headOn = carsContact(a, { ...pose('octo', -1), x: 136 });
  assert(headOn && headOn.nx > 0.7);
  const airborne = carsContact(a, { ...pose('octo', -1), x: 50, y: 670 });
  assert(airborne && airborne.ny > 0.7);
  assert.equal(carsContact(a, { ...pose('octo', -1), x: 50, y: 680 }), null);
});

test('Turbo Goal roof touches the ceiling and ball must clear the entire goal line inside the mouth', () => {
  const w = makeWorld();
  w.cars.length = 1;
  Object.assign(w.cars[0], pose(), { y: H - 35, vy: 600, grounded: false });
  w.ball.hidden = true;
  step(w, [{}]);
  assert(w.cars[0].y + 40 <= H + 0.25);
  w.cars = [];
  w.ball.hidden = false;
  for (const side of [-1, 1]) {
    Object.assign(w.ball, { x: side * (W / 2 + BALL_R - 1), y: (GY + GT) / 2, vx: 0, vy: 0 });
    assert.equal(step(w, []), -1);
    w.ball.x = side * (W / 2 + BALL_R + 1);
    assert.equal(step(w, []), side > 0 ? 0 : 1);
  }
});
