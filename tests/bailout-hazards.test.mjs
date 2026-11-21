import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../games/bailout/src/world.js';

test('Bailout wheels can clear a rounded hazard corner and hit its visible face', () => {
  function approach(x, y) {
    const terrain = {lava:[],loops:[],deathY:500,surfaceY:()=>Infinity};
    const world = new World({terrain,cps:[],pits:[],fans:[],objs:[{type:'tnt',x:0,y:0}]},'farm',{explode(){}});
    return world.interact({c:{x:-100,y:-80},wh:[{x,y,r:15}],riderOn:false,speed:120});
  }
  assert.equal(approach(-29,-54),null);
  assert.equal(approach(-28,-23),'tnt');
});
