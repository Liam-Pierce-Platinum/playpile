import { SCORES_A } from './game-scores-a.js';
import { SCORES_B } from './game-scores-b.js';
import { SCORES_C } from './game-scores-c.js';

export const SCORES = Object.freeze({ ...SCORES_A, ...SCORES_B, ...SCORES_C });

// Existing scores are part of the game mix. Freeze Run's countdown is music
// the player listens to for timing, so it never gets a competing soundtrack.
export const GAME_MUSIC = new Set(`
  blade-dash-story kart-clash slope-rush hole-feast stunt-city rooftop-duel
  getaway-flop subway-run rush-hour mirror-duel bubble-trouble toy-soldier-blitz
  roof-run auto-arena tiny-knight helix-drop axe-throw car-soccer sumo-slam prism
  air-hockey beat-dash neon-swarm pinball mini-golf graze lanternfall bailout
  twister-io block-royale bannerfall stack-attack snowball-royale wrecking-ball
  mower-madness sushi-conveyor bomb-squad grapple-goblin parry one-tile
  touge-drift blade-dash tiny-harbor inkvale freeze-run sky-aces ski-mountain
`.trim().split(/\s+/));

export const MUSIC_PREF = 'pd.ui.backing-music';
export const musicOn = () => {
  try { return localStorage.getItem(MUSIC_PREF) !== 'off'; }
  catch { return true; }
};
