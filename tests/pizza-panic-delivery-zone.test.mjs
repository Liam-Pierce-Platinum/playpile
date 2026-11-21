import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame,startShift,step } from '../games/pizza-panic/src/game.js';

function approach(x,y,vx) {
  const g = newGame({shift:1,up:{engine:0,boost:0,bag:0,size:0,arm:0}});
  startShift(g);
  g.cars=[]; g.rivals=[];
  Object.assign(g.p,{x,y,vx,vy:0,a:vx < 0 ? Math.PI : 0});
  return g;
}
test('the marked delivery limit stops the scooter without costing pizza heat', () => {
  const g = approach(22,420,-440);
  for(let i=0;i<12;i++) step(g,1/60);
  assert.equal(g.p.x,20);
  assert.ok(Math.abs(g.p.vx)<0.01);
  assert.equal(g.pops.some(p=>String(p.text).includes('CRASH')),false);
  assert.ok(g.orders.length > 0 && g.orders.every(o=>o.heat>98));
});
test('a direct impact into a rendered building registers a crash, a clear side pass does not', () => {
  for(const side of [true,false]) {
    const g = approach(0,0,440);
    const wall=g.city.buildings.find(b=>b.kind==='pizza');
    g.p.x=wall.x-27; g.p.y=side ? wall.y-28 : wall.y+wall.h/2;
    for(let i=0;i<8;i++) step(g,1/60);
    assert.equal(g.pops.some(p=>String(p.text).includes('CRASH')),!side);
  }
});

test('a delivery scooter can overtake traffic and still crash when it runs into the bumper', () => {
  for (const gap of [34, 0]) {
    const g = approach(820,808+gap,500);
    g.input.thr = 1;
    g.cars = [{ i:2,j:2,dir:0,d:120,spd:0,rx:900,ry:808,ra:0,
      x:900,y:808,a:0,col:'#fff',stun:5,nm:0,touched:-9,L:52,Wd:26 }];
    for(let i=0;i<18;i++) step(g,1/60);
    assert.equal(g.pops.some(p=>p.text.includes('CRASH')),gap===0);
    if(gap) assert.ok(g.p.x>g.cars[0].rx);
  }
});
