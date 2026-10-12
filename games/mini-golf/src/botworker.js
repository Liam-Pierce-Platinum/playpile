// Plans ghost-golfer shots off the main thread so the game never hitches.
import { HOLES } from './holes.js';
import { buildWorld } from './physics.js';
import { planSync } from './bot.js';
const worlds = {};
self.onmessage = (e) => {
  const { id, hole, ball, t0 } = e.data;
  const w = worlds[hole] || (worlds[hole] = buildWorld(HOLES[hole], hole));
  self.postMessage({ id, r: planSync(w, ball, t0) });
};
