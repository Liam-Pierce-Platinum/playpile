// One shared palette. Every colour in the game comes from here so the parks
// stay in the same world. Stardew-ish: warm, saturated, dark tinted outlines
// (never pure black), and every material is a 3-4 step ramp so a surface can
// be shaded without inventing colours.

export const P = {
  // outlines / ink. Plum-black, not black.
  ink:    '#241b2b',
  ink2:   '#3a2c44',
  ink3:   '#54415f',

  // concrete (street plaza, bowl)
  con1:   '#efe4d1', con2: '#cfc0aa', con3: '#a89882', con4: '#7d6f5e', con5: '#584d41',
  // painted kerb / coping
  cope1:  '#ffe9c0', cope2: '#d8bd93', cope3: '#9d8663',
  // wood (warehouse ramps, benches)
  wood1:  '#e0a765', wood2: '#b87c42', wood3: '#8a5729', wood4: '#5c3919',
  // metal (rails, poles, fences)
  met1:   '#e6eef2', met2: '#aebac2', met3: '#78868f', met4: '#4c5760',
  // grass / planters
  grs1:   '#a9d95e', grs2: '#78b23f', grs3: '#4f8129', grs4: '#33571c',
  // brick / building
  brk1:   '#c96a4c', brk2: '#a04a35', brk3: '#743226', brk4: '#4d211a',

  // skater
  skin1:  '#ffd3a8', skin2: '#e0a877', skin3: '#ad7850',
  hair1:  '#5a3a26', hair2: '#3d2618',
  tee1:   '#ff6b5b', tee2: '#d24338', tee3: '#94261f',
  jean1:  '#6d92cf', jean2: '#4a6aa5', jean3: '#31486f',
  shoe1:  '#f6f2e6', shoe2: '#c9c0ae', shoe3: '#6f675c',
  cap1:   '#7fd4e8', cap2: '#4a9cb5',

  // board
  deck1:  '#f0d38a', deck2: '#c9a45c', deck3: '#8f6f36',   // exposed maple ply (top edge)
  grip1:  '#3d3646', grip2: '#2a2532',                      // griptape
  art1:   '#ff8a3d', art2: '#d1552a', art3: '#8f3218',      // the graphic on the underside
  whl1:   '#fff4d8', whl2: '#d6c49e', whl3: '#93816a',
  trk1:   '#cfd8de', trk2: '#93a0a8', trk3: '#5f6a72',

  // ui
  ui1:    '#ffcf70', ui2: '#ff8a3d', ui3: '#7fd4e8', ui4: '#f4e3c6',
  bad:    '#ff5b5b', good: '#9ce85b',
};

// A theme is the light of a park: sky ramp, sun tint, ambient shadow and fog.
// `marks` puts recognisable silhouettes on the skyline -- `at` is a position in
// a 1400px strip that scrolls behind the buildings, so a landmark comes round
// every few screens rather than every screen.
export const THEMES = {
  // NEW YORK. Deco crowns, a bridge and the rooftop water tanks.
  sunset: {
    sky:   ['#2f6ec4', '#4f8fd8', '#79b0e8', '#a6cef2', '#d2e6f7'],
    far:   '#68809f', mid: '#556880', near: '#455568',
    sun:   '#fff6d8', shade: '#3c4a6b', ambient: 0.48,
    haze:  '#c6d8ea', ground: '#8a8578',
    back: 'newyork',
  },
  noon: {
    sky:   ['#3f7fd0', '#5b9adc', '#7db6e8', '#a6d2f2', '#d6ecf9'],
    far:   '#7fa6c4', mid: '#93b4cb', near: '#a9c4d4',
    sun:   '#fff6d8', shade: '#3c5a78', ambient: 0.46,
    haze:  '#bcd8ea', ground: '#9aa89a',
  },
  coast: {
    sky:   ['#2f6fc4', '#4f93d8', '#7bb8e8', '#a9d6f2', '#dcefe9'],
    far:   '#8fb0c9', mid: '#a3c2d2', near: '#bcd4dd',
    sun:   '#fff6d8', shade: '#3c5a78', ambient: 0.5,
    haze:  '#d6ecf9', ground: '#c9b48e',
  },
  // SEATTLE, from the docks: the needle over the water at dusk.
  dusk: {
    sky:   ['#8fa2b0', '#9fb0bc', '#aebcc6', '#bcc8d0', '#cbd5db'],
    far:   '#7a8896', mid: '#6b7784', near: '#5c6673',
    sun:   '#e8eef2', shade: '#4a5560', ambient: 0.42,
    haze:  '#c2ccd4', ground: '#6b6a66',
    back: 'seattle', sea: ['#3f5f75', '#4f7389', '#6b90a4'],
  },

  // CHICAGO, for the long run: the big black slab and its aerials.
  chicago: {
    sky:   ['#181f36', '#26304f', '#3d3f66', '#63496f', '#a35f66'],
    far:   '#2a2f4c', mid: '#363a58', near: '#454668',
    sun:   '#ffb07a', shade: '#1c1830', ambient: 0.3,
    haze:  '#5f5074', ground: '#464254',
    marks: [
      { kind: 'slab', at: 150, scale: 1.25 },
      { kind: 'slab', at: 300, scale: 0.8 },
      { kind: 'deco', at: 520, scale: 0.7 },
      { kind: 'tank', at: 760 },
      { kind: 'slab', at: 1000, scale: 1.0 },
      { kind: 'deco', at: 1240, scale: 0.6 },
    ],
  },

  // A city lot with a fence round it and brick behind. No landmarks: the point
  // is that this one is nowhere in particular.
  lot: {
    sky:   ['#5f7fa8', '#7b9cc0', '#9cb8d4', '#bcd2e2', '#dae8ef'],
    far:   '#6b4a44', mid: '#7d5750', near: '#8d645b',
    sun:   '#fff6d8', shade: '#4a3a3a', ambient: 0.46,
    haze:  '#c4b8ae', ground: '#9a9186',
    fence: true, brick: true,
  },
  // The two beach parks. `back: 'beach'` swaps the city skyline out for ocean,
  // palms and a pier -- a boardwalk with a downtown behind it reads as neither.
  boardwalk: {
    sky:   ['#2f6fc4', '#4f93d8', '#7bb8e8', '#a9d6f2', '#cfe8f7'],
    far:   '#3f7a52', mid: '#356b45', near: '#2c5a39',
    sun:   '#fff6d8', shade: '#3c5a78', ambient: 0.5,
    haze:  '#d6ecf9', ground: '#e0cd9a',
    back: 'beach', sea: ['#2f6fa8', '#3f89c2', '#5aa8d8'], sand: '#e8d6a0', pier: true,
  },
  venice: {
    sky:   ['#4a3560', '#7a4a68', '#b86a5e', '#e89a58', '#f7b877'],
    far:   '#4a5a3f', mid: '#3f4d36', near: '#33402c',
    sun:   '#ffdca0', shade: '#4a3350', ambient: 0.36,
    haze:  '#c98a63', ground: '#c9ad7a',
    back: 'beach', sea: ['#4a4a8f', '#63639e', '#8a7aad'], sand: '#cbb083', pier: false,
  },
  // THE BLOCK. You are standing ON this street, so the backdrop is the other
  // side of the road rather than a skyline: traffic, a far pavement and
  // building fronts close enough to read the windows.
  block: {
    sky:   ['#2f6ec4', '#4f8fd8', '#79b0e8', '#a6cef2', '#d2e6f7'],
    far:   '#68809f', mid: '#556880', near: '#455568',
    sun:   '#fff6d8', shade: '#3c4a6b', ambient: 0.5,
    haze:  '#c6d8ea', ground: '#8a8578',
    back: 'street',
  },

  // THE SUBWAY. The sky is the same New York blue as the street theme, because
  // half this park IS the street -- the backdrop reads the camera's height and
  // fades down into the tiled colours below.
  subway: {
    sky:   ['#2f6ec4', '#4f8fd8', '#79b0e8', '#a6cef2', '#d2e6f7'],
    far:   '#68809f', mid: '#556880', near: '#455568',
    sun:   '#fff6d8', shade: '#3c4a6b', ambient: 0.5,
    haze:  '#c6d8ea', ground: '#8a8578',
    back: 'subway',
    // and everything under the pavement
    dark: '#191c22', tile: '#cfc9b4', grout: '#8f8a76',
    band: '#2f6a4a', bandDark: '#1d3f2d',
    bed: '#37322c', deck: '#6f6a5f', column: '#3f5f4a',
    car: '#9aa2ac', carStripe: '#2f4a6b',
  },

  // SAN FRANCISCO. Fog rolling off the bay, the bridge in it, and painted
  // houses stepping down the hill in front.
  sanfran: {
    sky:   ['#8a9fb5', '#a3b6c8', '#bcc9d6', '#d2dae1', '#e6e9ea'],
    far:   '#8a8f9c', mid: '#7a7d8c', near: '#63667a',
    sun:   '#fff2d8', shade: '#4a4f5e', ambient: 0.44,
    haze:  '#d6dde2', ground: '#8f8a80',
    back: 'sanfran', sea: ['#4a6478', '#5c788c', '#7a94a4'],
    houses: ['#e8d6c0', '#d8a898', '#c9c0d8', '#e8ceA0', '#b8cfd8', '#e0b8c0'],
  },

  // The arena: floodlights, a dome, and a crowd you only ever see as a glow.
  arena: {
    sky:   ['#140f22', '#1d1730', '#2a1f42', '#3d2c56', '#54406b'],
    far:   '#2a2140', mid: '#332950', near: '#3f3260',
    sun:   '#ffe6a0', shade: '#120d1e', ambient: 0.32,
    haze:  '#6b4f8a', ground: '#3a3350',
    back: 'arena',
  },

  // A storm drain. Nothing behind it but more concrete.
  sewer: {
    sky:   ['#0e1218', '#141a22', '#1b222c', '#232b36', '#2c3541'],
    far:   '#1a212a', mid: '#212a34', near: '#2a3440',
    sun:   '#9ab5c4', shade: '#0a0d12', ambient: 0.2,
    haze:  '#243040', ground: '#333d48',
  },

  warehouse: {
    sky:   ['#181422', '#20192c', '#2a2036', '#332741', '#3d2e4c'],
    far:   '#241d31', mid: '#2c2339', near: '#372c46',
    sun:   '#ffd08a', shade: '#150f1e', ambient: 0.22,
    haze:  '#2a2036', ground: '#3a2f46',
  },
};
