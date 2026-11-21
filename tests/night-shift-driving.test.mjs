import test from 'node:test';
import assert from 'node:assert/strict';
import { boxOut, resolveCarCollisions } from '../games/night-shift/src/physics.js';

function car(x, y, heading = 0, speed = 20) {
  return {x, y, h:heading, speed, vx:speed*Math.cos(heading), vy:speed*Math.sin(heading),
    spec:{len:7.6, wid:2.35, mass:2000}, steerAngle:0};
}

test('Night Shift lets the visible side of a long vehicle pass a facade at street and diagonal headings', () => {
  for (const ang of [0, Math.PI/6, Math.PI/2]) {
    const wall = {x:0,y:0,w:60,d:10,ang};
    const offset = 6.3;
    const p = car(-Math.sin(ang)*offset, Math.cos(ang)*offset, ang);
    const start = {...p};
    assert.equal(boxOut(wall,p,true),0);
    assert.deepEqual(p,start);
  }
});

test('Night Shift resolves nose and garage-jamb hits while allowing a clean entrance', () => {
  const garage = {x:0,y:0,w:30,d:10,ang:0,garage:true,doorSide:'v+',mouth:8};
  const clean = car(0,8.5,-Math.PI/2);
  assert.equal(boxOut(garage,clean,true),0);
  assert.equal(clean.speed,20);
  const jamb = car(3.4,8.5,-Math.PI/2);
  assert.equal(boxOut(garage,jamb,true),20);
  assert(jamb.y>=8.79);
  assert(Math.abs(jamb.speed)<1e-9);
});

test('Night Shift charges closing speed, preserving clear passes and tangential motion', () => {
  const moving = car(0,0);
  for (const sideGap of [2.5,2.3]) {
    const other=car(0,sideGap,0,0);
    const hits=[];
    resolveCarCollisions([moving,other],(_a,_b,closing)=>hits.push(closing));
    assert.deepEqual(hits,[]);
    assert.equal(moving.speed,20);
  }
  const target=car(7.5,moving.y,0,0), hits=[];
  resolveCarCollisions([moving,target],(_a,_b,closing)=>hits.push(closing));
  assert.deepEqual(hits,[20]);
  assert(moving.vx<20 && target.vx>0);
});
