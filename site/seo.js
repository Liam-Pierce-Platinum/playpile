// =====================================================================
// PLAYPILE :: seo.js - SEARCH-FRIENDLY URLS AND KEYWORDS
// =====================================================================
//
// Every game page lives at /play/<seo>/, where <seo> is the game's name
// plus what people actually type into Google to find a game like it
// ("apex-f1-racing-game", not "apex"). The old /play/<slug>/ addresses
// still work: the build leaves a tiny redirect page there, so no link,
// ad or bookmark breaks.
//
// KW = the search phrase for each game (lower case, plain words). Keep
// it honest: it must describe the game, or Google treats it as spam.
// Category pages get the same treatment: /free-racing-games/ instead of
// /category/driving/.

export const KW = {
  'bladeborn': 'claw brawler game', 'ironsight': 'realistic fps shooter game', 'blade-dash-story': 'samurai story game',
  'egg-wars': 'egg shooter game', 'kart-clash': 'kart racing game', 'slope-rush': 'slope runner game',
  'tunnel-dive': 'tunnel runner game', 'bridge-race': 'bridge race game', 'hole-feast': 'hole eating game',
  'stick-swing': 'stickman swing game', 'moto-stunt': 'motorbike stunt game', 'drift-tower': 'one button drift game',
  'eggy-road': 'egg truck driving game', 'stunt-city': 'car stunt game', 'crazy-cattle': 'sheep battle royale game',
  'freeze-run': 'red light green light game', 'archer-duel': 'archery duel game', 'rooftop-duel': 'two player rooftop shooter',
  'snake-arena': 'snake io game', 'paper-land': 'territory io game', 'cube-merge': '2048 snake merge game',
  'getaway-flop': 'heist ragdoll race game', 'block-world': 'voxel parkour game', 'sky-climb': 'tower climbing game',
  'golf-orbit': 'golf drive game', 'time-shooter': 'time moves when you move shooter', 'subway-run': 'endless train runner game',
  'marble-roll': 'marble run game', 'rush-hour': 'traffic racer game', 'mirror-duel': 'fighting puzzle game',
  'bubble-trouble': 'bubble shooting platformer', 'pizza-panic': 'pizza delivery driving game', 'toy-soldier-blitz': 'toy soldier war game',
  'ski-mountain': 'endless skiing game', 'dodgeball-dash': 'dodgeball game', 'roof-run': 'rooftop runner game',
  'firework-frenzy': 'firework rocket flying game', 'pursued': 'horror chase game', 'deep-dive': 'submarine rescue game',
  'sky-aces': 'plane dogfight game', 'auto-arena': 'auto battler game', 'tiny-knight': 'knight action rpg game',
  'the-mark': 'sniper assassin game', 'chibi-clash': 'monster battle game', 'spelldelve': 'wizard roguelite game',
  'frontline': 'fps shooter game', 'curveball': '3d pong game', 'helix-drop': 'helix ball drop game',
  'axe-throw': 'axe throwing game', 'car-soccer': 'car football game', 'tank-duel': 'artillery tank game',
  'sumo-slam': 'sumo party game', 'prism': 'colour switch game', 'home-run': 'baseball batting game',
  'air-hockey': 'air hockey game', 'strike': 'bowling game', 'word-blitz': 'word search game',
  'beat-dash': 'rhythm runner game', 'neon-swarm': 'twin stick shooter game', 'pinball': 'pinball game',
  'mini-golf': 'mini golf game', 'graze': 'bullet hell dodging game', 'lanternfall': 'survivor roguelike game',
  'bailout': 'car stunt crash game', 'twister-io': 'tornado io game', 'block-royale': 'block puzzle game',
  'bannerfall': 'castle siege strategy game', 'stack-attack': 'stacking tower game', 'snowball-royale': 'snowball fight game',
  'wrecking-ball': 'wrecking ball demolition game', 'mower-madness': 'lawn mower game', 'sushi-conveyor': 'sushi restaurant game',
  'bomb-squad': 'bomb defusal puzzle game', 'grapple-goblin': 'grappling hook game', 'parry': 'sword parry rhythm game',
  'one-tile': 'heist puzzle game', 'derby': 'demolition derby game', 'touge-drift': 'mountain drift racing game',
  'blade-dash': 'samurai dash slash game', 'tiny-harbor': 'cosy island fishing game', 'highrise': 'tower shooter game',
  'kickback': 'recoil shooter platformer', 'exposure': 'horror survival game', 'dungeon-quest': 'retro dungeon crawler game',
  'apex': 'f1 racing game', 'nascar': 'stock car racing game', 'night-shift': 'crime getaway game',
  'grind-city': 'skateboarding game', 'southpaw': 'boxing game', 'inkvale': 'tower defense game',
  'penguin-dash': 'penguin fishing game', 'stack': 'stacking blocks game', 'drifter': 'asteroids space shooter',
  'merge': 'number merge puzzle game', 'pipeworks': 'pipe connecting puzzle', 'sweep': 'minesweeper puzzle game',
  'quickdraw': 'reaction quick draw game', 'hoops': 'basketball shooting game', 'spike': 'volleyball game',
  'crossing': 'road crossing game',
};

const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// the URL segment for a game: its name, then the keyword phrase, without saying a word twice
export function seoSlug(g) {
  const name = slugify(g.title.replace(/:.*$/, ''));
  const kw = KW[g.slug] || (String(g.cat || 'arcade').toLowerCase() + ' game');
  const nameWords = new Set(name.split('-'));
  const extra = slugify(kw).split('-').filter((w) => !nameWords.has(w));
  return [name, ...extra].join('-');
}
export const playUrl = (g) => '/play/' + seoSlug(g) + '/';
export const kwOf = (g) => KW[g.slug] || (String(g.cat || 'arcade').toLowerCase() + ' game');

// categories: /free-<word>-games/
export const CAT_SEO = {
  Action: 'free-action-games', Shooter: 'free-shooting-games', Driving: 'free-racing-games', Arcade: 'free-arcade-games',
  Strategy: 'free-strategy-games', Puzzle: 'free-puzzle-games', Adventure: 'free-adventure-games', Sport: 'free-sports-games',
  Horror: 'free-horror-games', Multiplayer: 'free-multiplayer-games',
};
export const catUrl = (cat) => '/' + (CAT_SEO[cat] || 'free-' + slugify(cat) + '-games') + '/';
export const CAT_TITLE = {
  Action: 'Free Action Games', Shooter: 'Free Shooting Games', Driving: 'Free Racing & Driving Games', Arcade: 'Free Arcade Games',
  Strategy: 'Free Strategy Games', Puzzle: 'Free Puzzle Games', Adventure: 'Free Adventure Games', Sport: 'Free Sports Games',
  Horror: 'Free Horror Games', Multiplayer: 'Free Multiplayer Games to Play With Friends',
};
