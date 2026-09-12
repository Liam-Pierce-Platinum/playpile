// The campaign. Levels are built on demand and torn down when you leave, so
// only one exists at a time.
import { buildLevel1 } from './level1.js';
import { buildLevel2 } from './level2.js';
import { buildLevel3 } from './level3.js';
import { buildLevel4 } from './level4.js';
import { LEVEL_INTROS, LEVEL_OUTROS, BOSS_INTROS } from '../game/story.js';

export const LEVELS = [
  {
    id: 'forest',
    name: 'THE FOREST BETWEEN THE CLIFFS',
    build: buildLevel1,
    boss: 'greenDragon',
    bossName: 'GREEN DRAGON',
    intro: LEVEL_INTROS.forest,
    outro: LEVEL_OUTROS.forest,
    bossIntro: BOSS_INTROS.greenDragon,
    night: false,
  },
  {
    id: 'mine',
    name: 'THE MINE SHAFT',
    build: buildLevel2,
    boss: 'redDragon',
    bossName: 'RED DRAGON',
    intro: LEVEL_INTROS.mine,
    outro: LEVEL_OUTROS.mine,
    bossIntro: BOSS_INTROS.redDragon,
    // Not "night" -- the mine authors its own underground lighting, and the
    // moonlit night preset would paint it blue and outdoors.
    night: false,
  },
  {
    id: 'mountain',
    name: 'THE FROZEN MOUNTAIN',
    build: buildLevel3,
    boss: 'iceDragon',
    bossName: 'ICE DRAGON',
    intro: LEVEL_INTROS.mountain,
    outro: LEVEL_OUTROS.mountain,
    bossIntro: BOSS_INTROS.iceDragon,
    night: false,
  },
  {
    id: 'cliff',
    name: 'THE BLACK CLIFF',
    build: buildLevel4,
    boss: 'blackDragon',
    bossName: 'BLACK DRAGON',
    intro: LEVEL_INTROS.cliff,
    outro: LEVEL_OUTROS.cliff,
    bossIntro: BOSS_INTROS.blackDragon,
    night: false,
  },
];

/**
 * Where the people go once a level is at peace. Each level supplies its own
 * spots; this is only the roster of who stands in them.
 */
export const PEACE = {
  forest: { roles: ['folk', 'farmer', 'folk', 'smith', 'farmer'], count: 14 },
  mine: { roles: ['miner', 'miner', 'smith', 'miner'], count: 12 },
  mountain: { roles: ['farmer', 'folk', 'farmer', 'smith'], count: 12 },
  cliff: { roles: ['folk', 'folk', 'smith', 'farmer'], count: 12 },
};

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || LEVELS[0];
}
export function levelIndex(id) {
  const i = LEVELS.findIndex(l => l.id === id);
  return i < 0 ? 0 : i;
}
