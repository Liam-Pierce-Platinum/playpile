import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as hockey from '../games/air-hockey/src/game.js';
import * as soccer from '../games/car-soccer/src/physics.js';
import { GamepadInput } from '../games/dungeon-quest/src/player/gamepad.js';
import { Sim } from '../games/sumo-slam/src/sim.js';
import { Game } from '../games/tank-duel/src/game.js';

test('Puck Blitz routes both mallets independently and declares a local winner', () => {
  const game = hockey.createGame({ mode: '2p', target: 1, seed: 7 });
  assert.equal(hockey.isBot(game, 0), false);
  assert.equal(hockey.isBot(game, 1), false);
  hockey.setTarget(game, 0, hockey.W / 2, hockey.H / 2 + 30);
  hockey.setTarget(game, 1, hockey.W - 50, 100);
  for (let frame = 0; frame < 400 && game.phase !== 'over'; frame++) hockey.step(game, 1 / 120);
  assert.equal(game.phase, 'over');
  assert.deepEqual(game.score, [1, 0]);
  assert.equal(game.winner, 0);
  assert.equal(game.m[0].x, hockey.W / 2);
  assert.equal(game.m[1].x, hockey.W - 50);
});

test('Turbo Goal applies two independent steering inputs and both cars can hit the ball', () => {
  const world = soccer.makeWorld();
  soccer.kickoff(world);
  const hits = new Set();
  const inputs = [{ x: 1, y: 0, jump: false, boost: false }, { x: -1, y: 0, jump: false, boost: false }];
  const [first, second] = world.cars;
  const initial = [first.x, second.x];
  for (let frame = 0; frame < 360; frame++) {
    soccer.step(world, inputs);
    for (const event of world.events) if (event.type === 'hit') hits.add(event.car.id);
    if (frame === 60) {
      assert.ok(first.x > initial[0]);
      assert.ok(second.x < initial[1]);
    }
  }
  assert.deepEqual([...hits].sort(), [0, 1]);
});

test('Dungeon Quest keeps the second controller separate through a sparse gamepad list and disconnect', (t) => {
  const makePad = (index, moveX, attack) => ({
    index, id: 'pad-' + index, connected: true, axes: [moveX, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: attack && i === 14, value: attack && i === 14 ? 1 : 0 })),
  });
  const pads = [null, makePad(1, 1, false), null, makePad(3, -1, true)];
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const listenerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value() {} });
  t.after(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
    if (listenerDescriptor) Object.defineProperty(globalThis, 'addEventListener', listenerDescriptor);
    else delete globalThis.addEventListener;
  });
  const first = new GamepadInput();
  const second = new GamepadInput();
  second.only = 1;
  first.poll();
  second.poll();
  assert.deepEqual([first.moveX, second.moveX], [1, -1]);
  assert.equal(first.held.has('attack'), false);
  assert.equal(second.pressed.has('attack'), true);
  pads[3].connected = false;
  second.poll();
  assert.equal(second.moveX, 0);
  assert.equal(second.held.size, 0);
});

test('Sumo Slam advances a full simulated local match with two human seats and two bots', () => {
  const sim = new Sim({ seed: 183 });
  sim.setupMatch([
    { name: 'One', human: 0 }, { name: 'Two', human: 1 },
    { name: 'Bot One', human: null }, { name: 'Bot Two', human: null },
  ]);
  for (let round = 0; round < 12 && sim.matchWinner == null; round++) {
    sim.startRound();
    for (let frame = 0; frame < 8400 && sim.phase !== 'end'; frame++) {
      const [one, two] = sim.ws;
      one.input = { x: -one.x * 0.45, z: -one.z * 0.45, dash: false };
      two.input = { x: Math.cos(two.face + Math.PI), z: Math.sin(two.face + Math.PI), dash: false };
      sim.step(1 / 120);
    }
    assert.equal(sim.phase, 'end');
  }
  assert.deepEqual(sim.ws.map((w) => w.human), [0, 1, null, null]);
  assert.ok(sim.matchWinner != null);
  assert.equal(sim.ws.find((w) => w.id === sim.matchWinner).score, 3);
});

test('Tank Duel fires once for each local player and hands each turn to the other', () => {
  const terrain = {
    pads: [180, 1420], generate() {}, topAt: () => 600, surfaceBelow: () => 600,
    solid: (_x, y) => y > 600, carve() {},
  };
  const silentEffects = new Proxy({}, { get: () => () => {} });
  const game = new Game(terrain, silentEffects, silentEffects);
  game.newMatch('pvp');
  assert.deepEqual(game.tanks.map((tank) => tank.isBot), [false, false]);
  const initialTurn = game.turn;
  for (let player = 0; player < 2; player++) {
    const turn = game.turn;
    game.setAim(turn === 0 ? 30 : 150, 20);
    game.fire();
    for (let frame = 0; frame < 600 && game.phase !== 'aim'; frame++) game.update(1 / 60);
    assert.equal(game.phase, 'aim');
    assert.equal(game.turn, 1 - turn);
  }
  assert.equal(game.turn, initialTurn);
  assert.deepEqual(game.stats.shots, [1, 1]);
});
