// BANNERFALL :: data/biomes.js - generation rules per biome (DESIGN.md 3.4).
// env: the lit palette in data/envs.js. hill: rolling-hill amplitude (m). forest: how much of the
// land is woodland (0..1). rivers: how many rivers. valley: river valley half-width (m).
// fields: crop-field bias around villages. mud: patches of mud. pools: marsh pools.
// mesas: flat-topped rises. snow: the ground is snow. ridges: rocky ridgelines.

export const BIOMES = {
  spring:   { name: 'Spring vale', env: 'spring', hill: 14, hillScale: 520, forest: 0.24, rivers: 1, valley: 170, fields: 0.6, mud: 0, pools: 0, mesas: 1, ridges: 1, weather: 'spring' },
  forest:   { name: 'Old forest', env: 'woods', hill: 18, hillScale: 480, forest: 0.52, rivers: 1, valley: 140, fields: 0.3, mud: 0, pools: 0, mesas: 1, ridges: 2, weather: 'forest' },
  river:    { name: 'River country', env: 'noon', hill: 10, hillScale: 600, forest: 0.2, rivers: 2, valley: 230, fields: 0.6, mud: 0.05, pools: 0, mesas: 0, ridges: 0, weather: 'river' },
  farmland: { name: 'Farmland', env: 'harvest', hill: 9, hillScale: 640, forest: 0.14, rivers: 1, valley: 200, fields: 1, mud: 0, pools: 0, mesas: 0, ridges: 0, weather: 'farmland' },
  marsh:    { name: 'Marshland', env: 'marsh', hill: 5, hillScale: 420, forest: 0.2, rivers: 1, valley: 260, fields: 0.2, mud: 0.25, pools: 14, mesas: 2, ridges: 0, weather: 'marsh' },
  autumn:   { name: 'Autumn uplands', env: 'autumn', hill: 22, hillScale: 420, forest: 0.28, rivers: 1, valley: 150, fields: 0.6, mud: 0, pools: 0, mesas: 1, ridges: 3, weather: 'autumn' },
  snow:     { name: 'Snow mountains', env: 'snow', hill: 30, hillScale: 380, forest: 0.22, rivers: 1, valley: 150, fields: 0, mud: 0, pools: 0, mesas: 1, ridges: 5, snow: true, weather: 'snow' },
  highland: { name: 'Highland moor', env: 'highland', hill: 26, hillScale: 440, forest: 0.1, rivers: 1, valley: 140, fields: 0.2, mud: 0.05, pools: 0, mesas: 4, ridges: 3, weather: 'highland' },
  dusk:     { name: 'Dusk mudlands', env: 'dusk', hill: 7, hillScale: 500, forest: 0.16, rivers: 1, valley: 220, fields: 0.3, mud: 0.4, pools: 6, mesas: 0, ridges: 0, weather: 'dusk' },
  royal:    { name: 'Royal heartland', env: 'overcast', hill: 12, hillScale: 560, forest: 0.18, rivers: 1, valley: 200, fields: 0.8, mud: 0, pools: 0, mesas: 2, ridges: 0, weather: 'royal' },
};
export const BIOME_IDS = Object.keys(BIOMES);

// map sizes (DESIGN.md 3.1)
export const SIZES = {
  field:  { name: 'Field', m: 1024, regions: 6, villages: 2, strongholds: 1, castles: 0, maxEnemies: 1 },
  small:  { name: 'Small', m: 2048, regions: 20, villages: 7, strongholds: 3, castles: 1, maxEnemies: 2 },
  medium: { name: 'Medium', m: 3072, regions: 34, villages: 12, strongholds: 6, castles: 3, maxEnemies: 3 },
  large:  { name: 'Large', m: 4096, regions: 54, villages: 18, strongholds: 9, castles: 5, maxEnemies: 4 },
};
