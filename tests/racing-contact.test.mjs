import test from 'node:test';
import assert from 'node:assert/strict';
import { collide as formulaContact } from '../games/apex/src/world.js';
import { collide as stockContact } from '../games/nascar/src/world.js';
import { carBody, railClearance } from '../games/touge-drift/src/cars.js';
import { contact } from '../games/_shared/vehicle-contact.js';

for (const [title, collide, length, width] of [
  ['Apex', formulaContact, 5.2, 2], ['NASCAR', stockContact, 5.1, 1.96],
]) {
  test(title + ' separates visible near misses from true contact at different headings', () => {
    for (const yaw of [0, .35, 1.1, Math.PI / 2, Math.PI]) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const runner = (forward, lateral, speed, heading = yaw) => ({
        car: { x: forward*fx + lateral*fz, z: forward*fz - lateral*fx, yaw: heading,
          vx: speed*fx, vz: speed*fz, yawRate: 0, mass: 1200 }, y: 0, impacts: [],
      });
      for (const [along, across, hits] of [
        [length + .06, 0, 0], [0, width + .05, 0], [length - .12, 0, 1], [2.1, width - .12, 1],
      ]) {
        const a = runner(0,0,35), b = runner(along,across,8);
        collide([a,b]);
        assert.equal(a.impacts.length, hits);
        assert.equal(b.impacts.length, hits);
      }
      const a = runner(0,0,35), b = runner(0,0,4,yaw + Math.PI/2);
      collide([a,b]);
      assert.equal(a.impacts.length,1);
      assert.ok(Math.hypot(a.car.x-b.car.x,a.car.z-b.car.z)>width/2);
    }
  });
}

test('Touge Drift uses the drawn body including a rival sliding sideways', () => {
  const self = carBody({x:0,y:0,h:0});
  assert.equal(contact(self,carBody({x:0,y:32,h:0})),null);
  assert.ok(contact(self,carBody({x:49,y:0,h:0})));
  assert.ok(contact(self,carBody({x:0,y:33,h:0,drawH:Math.PI/2})));
  assert.equal(railClearance({x:0,y:0,h:0},{a:0}),13);
  assert.equal(railClearance({x:0,y:0,h:Math.PI/2},{a:0}),26);
});
