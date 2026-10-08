// The arenas. The camera sits up in the stands looking down across the ring,
// so the floor is a trapezoid: the far ropes are narrower and higher up the
// screen than the near ones. Sprites are NOT scaled with depth (pixel art does
// not survive that); only the floor and the ropes are.
//
// Each arena is a static backdrop painted once into its own canvas, an
// animated crowd on top of it, the ring, and a strip of front-row heads in
// silhouette across the bottom of the screen.

import { createView } from './view.js';
import { text } from './font.js';
import { P, mix, shade, light } from './palette.js';
import { SKINS } from './roster.js';

export const W = 384, H = 216;
// floor plane -> screen
export const proj = (x, z) => [192 + x * (1 - z * 0.0024), 184 - z * 0.98];
const FX0 = -128, FX1 = 128, FZ0 = -3, FZ1 = 79;     // the canvas, a bit past where fighters can stand

export const THEMES = {
  pit: {
    canvas: ['#8a95a8', '#6f7a8e', '#56607a'], apron: '#3a3440', apronText: '#c9b48a', logo: 'THE PIT', posts: ['#c9302c', '#2c5cc9'],
    fog: '#1c1418', crowdRows: 3, sparse: 0.55, dark: 0.45, light: '#ffe2a8', ropes: ['#e8e0d0', '#e8e0d0', '#e8e0d0'],
  },
  rec: {
    canvas: ['#4f8fe0', '#3a72c0', '#2a5698'], apron: '#1f3a6e', apronText: '#ffd36b', logo: 'ROSEWOOD', posts: ['#e8463c', '#3d8bff'],
    fog: '#3b4a42', crowdRows: 5, sparse: 0.25, dark: 0.15, light: '#f4fff0', ropes: ['#ff4a3d', '#f2f2f2', '#3d8bff'],
  },
  pier: {
    canvas: ['#c0564a', '#9c3e36', '#742a26'], apron: '#2a1c1c', apronText: '#ff9b3d', logo: 'PIER 9', posts: ['#e8463c', '#e8e0d0'],
    fog: '#141820', crowdRows: 4, sparse: 0.2, dark: 0.4, light: '#ffd9a0', ropes: ['#e8e0d0', '#c0564a', '#e8e0d0'],
  },
  casino: {
    canvas: ['#2a2032', '#1e1726', '#140f1a'], apron: '#5a0e2a', apronText: '#ffd84a', logo: 'LUCKY 7', posts: ['#ffd84a', '#ff3d7f'],
    fog: '#1a0e22', crowdRows: 5, sparse: 0.1, dark: 0.35, light: '#ffe8ff', ropes: ['#ffd84a', '#ff3d7f', '#ffd84a'],
  },
  roof: {
    canvas: ['#d8c8a0', '#b8a478', '#8c7a54'], apron: '#7a1e1e', apronText: '#ffd36b', logo: 'CHINATOWN', posts: ['#d8263c', '#ffd36b'],
    fog: '#4a2a3a', crowdRows: 3, sparse: 0.3, dark: 0.0, light: '#ffd0a0', ropes: ['#d8263c', '#ffd36b', '#d8263c'],
  },
  wbowl: {
    canvas: ['#2a2a3a', '#20202e', '#161622'], apron: '#14141e', apronText: '#ff3d3d', logo: 'SLAMBOWL', posts: ['#ff3d3d', '#3d8bff'],
    fog: '#0a0a14', crowdRows: 7, sparse: 0.0, dark: 0.45, light: '#c8d8ff', ropes: ['#ff3d3d', '#ffffff', '#3d8bff'],
  },
  dohyo: {
    canvas: ['#d8b07a', '#c49862', '#9a7448'], apron: '#7a5a3a', apronText: '#f2e6c8', logo: '', posts: ['#000', '#000'],
    fog: '#1a120c', crowdRows: 6, sparse: 0.05, dark: 0.3, light: '#ffe8c0', ropes: ['#000', '#000', '#000'],
  },
  garden: {
    canvas: ['#f2f2f2', '#d4d8e0', '#aab0bc'], apron: '#14162a', apronText: '#ffd36b', logo: 'THE GARDEN', posts: ['#e8463c', '#3d8bff'],
    fog: '#0c0d18', crowdRows: 7, sparse: 0.0, dark: 0.5, light: '#ffffff', ropes: ['#e8463c', '#f2f2f2', '#3d8bff'],
  },
};

const SHIRTS = ['#c94a4a', '#4a7ac9', '#e0c050', '#5aa060', '#eeeeee', '#8a5ac9', '#e07a3a', '#333344', '#c9c9c9', '#3a9aa8', '#a83a6a', '#6a4a3a'];
const HAIRS = ['#2a1a10', '#5a3a26', '#c9a050', '#1a1414', '#8a8a8a', '#6a2a1a', '#d8c8a0'];

function rngOf(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------------------------------------------------------------- build ---
const cache = new Map();
export function getArena(id) {
  if (cache.has(id)) return cache.get(id);
  const th = THEMES[id] || THEMES.pit;
  const rnd = rngOf(id.length * 977 + id.charCodeAt(0) * 31);
  const bgV = createView(document.createElement('canvas'), { fixed: { w: W, h: H, scale: 1 } });
  paintBackdrop(bgV, id, th, rnd);
  const crowd = makeCrowd(id, th, rnd);
  const ringV = createView(document.createElement('canvas'), { fixed: { w: W, h: H, scale: 1 }, alpha: true });
  ringV.g.clearRect(0, 0, W, H);
  if (id === 'dohyo') paintDohyo(ringV, th, rnd); else paintRingFloor(ringV, th, id, rnd);
  const front = makeFront(rnd, th);
  const A = { id, th, bg: bgV.g.canvas, ring: ringV.g.canvas, crowd, front, rnd };
  cache.set(id, A);
  return A;
}

function vgrad(v, x, y, w, h, cols) {
  // banded vertical gradient through a list of colours, dithered at the seams
  const n = cols.length - 1;
  for (let i = 0; i < n; i++) {
    const y0 = y + Math.round(h * i / n), y1 = y + Math.round(h * (i + 1) / n);
    v.rect(x, y0, w, y1 - y0, cols[i]);
    v.dither(x, y0 + Math.round((y1 - y0) * 0.6), w, Math.round((y1 - y0) * 0.4), 'rgba(0,0,0,0)', cols[i + 1], 0.5);
  }
}

function paintBackdrop(v, id, th, rnd) {
  v.clear('#000');
  if (id === 'pit') {
    // brick walls, a low ceiling with pipes, bare bulbs on cords
    v.rect(0, 0, W, 120, '#3a1e18');
    for (let y = 8; y < 120; y += 5) {
      const off = (y / 5) % 2 ? 0 : 6;
      for (let x = -12 + off; x < W; x += 12) {
        const c = [P.brk3, '#5e2a20', '#6a3024', P.brk4][Math.floor(rnd() * 4)];
        v.rect(x, y, 11, 4, c);
        if (rnd() < 0.3) v.rect(x + 1, y, 9, 1, mix(c, '#c96a4c', 0.25));
      }
    }
    v.rect(0, 0, W, 9, '#1a1214');
    for (let i = 0; i < 3; i++) { v.rect(0, 3 + i * 2, W, 1, ['#4c5760', '#78868f', '#2a2a30'][i]); }
    v.rect(40, 9, 3, 30, '#2a2a30'); v.rect(300, 9, 3, 40, '#2a2a30');
    // gym signage + a speed bag platform on the wall
    v.rect(22, 30, 70, 16, P.ink); v.rect(23, 31, 68, 14, '#d8c088');
    text(v, 'NO QUITTERS', 57, 35, '#7a2a20', { align: 'center' });
    v.rect(296, 34, 60, 4, P.wood3); v.rect(310, 38, 2, 8, P.met3); v.disc(311, 49, 4, P.ink); v.disc(311, 49, 3, '#8a3a28');
    // old fight posters
    for (const [x, c] of [[110, '#d8b850'], [262, '#c84838']]) {
      v.rect(x, 26, 20, 28, P.ink); v.rect(x + 1, 27, 18, 26, c);
      v.rect(x + 3, 30, 14, 10, shade(c, 0.4)); v.rect(x + 3, 43, 14, 2, P.ink2); v.rect(x + 3, 47, 10, 2, P.ink2);
    }
    // concrete floor around the ring
    v.rect(0, 112, W, 104, '#2a2224');
    v.dither(0, 112, W, 104, 'rgba(0,0,0,0)', '#342a2c', 0.3);
  } else if (id === 'rec') {
    // painted cinderblock, high windows at night, banners, wooden bleachers
    v.rect(0, 0, W, 120, '#9ab8a0');
    for (let y = 0; y < 120; y += 6) v.rect(0, y, W, 1, '#88a68e');
    for (let x = 0; x < W; x += 16) for (let y = 0; y < 120; y += 12) v.rect(x + (y % 24 ? 8 : 0), y, 1, 6, '#88a68e');
    v.rect(0, 0, W, 5, '#5a6a60');
    for (let i = 0; i < 6; i++) {
      const x = 16 + i * 62;
      v.rect(x, 9, 34, 18, P.ink); v.rect(x + 1, 10, 32, 16, '#1e2a4a');
      v.rect(x + 17, 10, 1, 16, P.ink); v.rect(x + 1, 18, 32, 1, P.ink);
      v.rect(x + 3, 12, 3, 2, '#3a4a70');
    }
    // fluorescent tubes
    for (let i = 0; i < 4; i++) { v.rect(30 + i * 96, 3, 40, 2, '#f8fff4'); v.rect(30 + i * 96, 5, 40, 1, '#b8c8b8'); }
    const ban = [['ROSEWOOD', '#c8282c'], ['BOXING', '#283cc8'], ['CLUB', '#c8282c']];
    ban.forEach(([t, c], i) => { const x = 70 + i * 100; v.rect(x, 30, 50, 12, P.ink); v.rect(x + 1, 31, 48, 10, c); text(v, t, x + 25, 33, '#fff2c0', { align: 'center' }); });
    v.rect(0, 112, W, 104, '#b8884a');
    for (let y = 112; y < H; y += 4) v.rect(0, y, W, 1, '#a07438');
    v.rect(0, 140, W, 1, '#f2f2f2');
  } else if (id === 'pier') {
    // corrugated tin, a roller door open on the harbour, string lights
    v.rect(0, 0, W, 120, '#3a4450');
    for (let x = 0; x < W; x += 4) { v.rect(x, 0, 1, 120, '#2e3640'); v.rect(x + 2, 0, 1, 120, '#465260'); }
    v.rect(0, 0, W, 6, '#1a1e24');
    for (let x = 0; x < W; x += 48) v.rect(x, 0, 4, 120, '#2a2420');
    // the door: night water and a moon
    v.rect(148, 12, 88, 70, P.ink);
    vgrad(v, 150, 14, 84, 44, ['#0e1430', '#1a2450', '#2a3a6a']);
    v.disc(212, 26, 6, '#f4f0d8'); v.disc(210, 25, 5, '#f8f6e8');
    for (let i = 0; i < 40; i++) v.rect(150 + Math.floor(rnd() * 84), 14 + Math.floor(rnd() * 30), 1, 1, '#c8d0f0');
    v.rect(150, 58, 84, 22, '#0c1428');
    for (let i = 0; i < 18; i++) v.rect(152 + Math.floor(rnd() * 78), 60 + Math.floor(rnd() * 18), 3 + Math.floor(rnd() * 4), 1, '#2a4070');
    // a far crane
    v.rect(162, 30, 2, 28, '#1a1a2a'); v.rect(162, 30, 26, 2, '#1a1a2a'); v.rect(186, 32, 1, 10, '#1a1a2a');
    // crates
    for (const [x, y, w] of [[8, 70, 28], [30, 82, 22], [340, 74, 30], [318, 86, 22]]) {
      v.rect(x, y, w, 120 - y, P.ink); v.rect(x + 1, y + 1, w - 2, 118 - y, P.wood3);
      v.rect(x + 1, y + 1, w - 2, 2, P.wood2); v.line(x + 1, y + 1, x + w - 2, 119, P.wood4);
    }
    v.rect(0, 112, W, 104, '#262628');
    v.dither(0, 112, W, 104, 'rgba(0,0,0,0)', '#303034', 0.35);
  } else if (id === 'casino') {
    // velvet, chandeliers, neon
    vgrad(v, 0, 0, W, 120, ['#1a0a20', '#2a0e30', '#3a1238']);
    for (let x = 0; x < W; x += 10) v.rect(x, 0, 1, 120, '#24082a');
    for (const x of [60, 192, 324]) {
      v.line(x, 0, x, 10, '#8a7040');
      for (let i = -2; i <= 2; i++) { v.rect(x + i * 4, 10 + Math.abs(i), 2, 6 - Math.abs(i), '#ffe8a0'); v.rect(x + i * 4, 16, 1, 2, '#fff8e0'); }
      v.rect(x - 9, 10, 19, 1, '#d8b060');
    }
    // neon signs (drawn lit; render.js flickers them)
    v.rect(16, 24, 92, 26, '#0e0612'); v.rect(276, 24, 92, 26, '#0e0612');
    v.rect(0, 112, W, 104, '#3a0e1e');
    for (let y = 112; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) v.rect(x, y, 8, 8, '#320a1a');
  } else if (id === 'roof') {
    // sunset over the skyline, water towers, a line of red lanterns
    vgrad(v, 0, 0, W, 104, ['#2a1a4a', '#5a2a5a', '#a8445a', '#e0704a', '#f8a850', '#ffd890']);
    v.disc(240, 86, 14, '#ffe8a0'); v.disc(240, 86, 12, '#fff4c8');
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rnd() * W), w = 12 + Math.floor(rnd() * 22), h = 30 + Math.floor(rnd() * 50);
      v.rect(x, 104 - h, w, h, '#3a1e3a');
    }
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(rnd() * W), w = 14 + Math.floor(rnd() * 26), h = 18 + Math.floor(rnd() * 36);
      v.rect(x, 104 - h, w, h, '#24122a');
      for (let wy = 104 - h + 4; wy < 100; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rnd() < 0.3) v.rect(wx, wy, 2, 2, rnd() < 0.5 ? '#ffd06a' : '#ff9a5a');
    }
    // water tower
    v.rect(26, 40, 22, 24, P.ink); v.rect(27, 41, 20, 22, '#5a3424'); for (let x = 28; x < 47; x += 3) v.rect(x, 41, 1, 22, '#4a2a1c');
    v.poly([[24, 41], [37, 32], [50, 41]], P.ink); v.poly([[26, 40], [37, 33], [48, 40]], '#3a2018');
    v.rect(28, 64, 2, 16, P.ink); v.rect(44, 64, 2, 16, P.ink);
    // rooftop deck
    v.rect(0, 104, W, 112, '#5a4a48');
    for (let y = 104; y < H; y += 6) v.rect(0, y, W, 1, '#4a3c3a');
    v.rect(0, 100, W, 5, '#3a2a2a'); v.rect(0, 100, W, 1, '#6a5050');
  } else if (id === 'wbowl') {
    // a stadium in the dark, the entrance stage and its big screen at the back
    v.rect(0, 0, W, 120, '#06060c');
    for (let r = 0; r < 14; r++) {
      const y = 22 + r * 7, c = mix('#0a0a14', '#1a1a2a', r / 14);
      v.rect(0, y, W, 6, c);
      for (let x = (r % 2) * 3; x < W; x += 6) if (rnd() < 0.85) v.rect(x, y + 1, 3, 3, mix('#141428', SHIRTS[Math.floor(rnd() * SHIRTS.length)], 0.12 + r * 0.012));
    }
    // stage: a ramp of light and the screen
    v.rect(120, 0, 144, 52, P.ink); v.rect(122, 2, 140, 46, '#0c1030');
    v.rect(110, 52, 164, 6, '#2a2a40'); v.rect(110, 52, 164, 1, '#5a5a80');
    v.poly([[150, 58], [234, 58], [262, 100], [122, 100]], '#1a1a2c');
    v.poly([[180, 58], [204, 58], [214, 100], [170, 100]], '#24243a');
    for (const x of [112, 268]) { v.rect(x - 3, 30, 6, 28, '#2a2a40'); v.rect(x - 2, 30, 4, 2, '#ff7a3a'); }
    v.rect(0, 112, W, 104, '#0c0c16');
  } else if (id === 'dohyo') {
    // the sumo hall: dark wood, box seats stepping up, banners down the walls
    v.rect(0, 0, W, 120, '#1e140c');
    for (let r = 0; r < 12; r++) {
      const y = 30 + r * 7;
      v.rect(0, y, W, 6, mix('#2a1c10', '#4a3420', r / 12));
      for (let x = (r % 2) * 12; x < W; x += 24) v.rect(x, y, 1, 6, '#1a1008');
    }
    // nobori banners
    for (const [x, c] of [[8, '#c8282c'], [28, '#f2e6c8'], [48, '#2848a8'], [326, '#2fbf5a'], [346, '#f2e6c8'], [366, '#c8282c']]) {
      v.rect(x, 2, 12, 46, P.ink); v.rect(x + 1, 3, 10, 44, c);
      for (let k = 0; k < 4; k++) v.rect(x + 3, 8 + k * 9, 6, 5, shade(c, 0.5));
    }
    // the hanging roof over the ring (tsuriyane)
    v.poly([[96, 0], [288, 0], [312, 20], [72, 20]], '#3a2414');
    v.poly([[72, 20], [312, 20], [306, 26], [78, 26]], '#5a3a1e');
    v.rect(78, 26, 228, 4, '#2a1a0c');
    for (let x = 84; x < 300; x += 8) v.rect(x, 21, 3, 4, '#c8a050');
    v.poly([[150, 0], [234, 0], [250, 12], [134, 12]], '#4a2e18');
    // four tassels at the corners: blue, red, white, black
    for (const [x, c] of [[86, '#2a5ac8'], [298, '#c82a2a'], [120, '#f2f2f2'], [264, '#1a1a1a']]) {
      v.rect(x - 2, 28, 5, 14, P.ink); v.rect(x - 1, 29, 3, 12, c); v.disc(x, 44, 3, P.ink); v.disc(x, 44, 2, c);
    }
    v.rect(0, 112, W, 104, '#2a1c10');
    for (let y = 112; y < H; y += 9) for (let x = (y % 18 ? 0 : 16); x < W; x += 32) v.rect(x, y, 30, 8, '#33230f');
  } else if (id === 'garden') {
    // a bowl of people going up into the dark, a jumbotron, light rigs
    v.rect(0, 0, W, 120, '#07070e');
    for (let r = 0; r < 14; r++) {
      const y = 14 + r * 7, c = mix('#0a0a14', '#1a1a2a', r / 14);
      v.rect(0, y, W, 6, c);
      for (let x = (r % 2) * 3; x < W; x += 6) if (rnd() < 0.85) v.rect(x, y + 1, 3, 3, mix('#141428', SHIRTS[Math.floor(rnd() * SHIRTS.length)], 0.12 + r * 0.012));
    }
    // jumbotron
    v.rect(150, 0, 84, 30, P.ink); v.rect(152, 0, 80, 28, '#1a1a26'); v.rect(154, 2, 76, 22, '#0a1830');
    v.rect(150, 30, 84, 3, '#3a3a4a');
    // light truss
    v.rect(0, 2, W, 2, '#2a2a36'); for (let x = 0; x < W; x += 8) v.line(x, 2, x + 4, 6, '#2a2a36');
    v.rect(0, 112, W, 104, '#101018');
  }
  // bleachers stepping down either side of the ring, under the side crowds
  for (let k = 0; k < 7; k++) {
    const y = 112 + k * 13, c1 = mix(th.fog, '#6a6070', 0.35), c2 = mix(th.fog, '#000', 0.3);
    for (const [x0, w] of [[0, 92 - k * 4], [W - 92 + k * 4, 92 - k * 4]]) {
      v.rect(x0, y + 6, w, 3, c1); v.rect(x0, y + 9, w, 4, c2);
    }
  }
  // ringside: the press table under the apron
  v.rect(0, 196, W, 20, mix(th.fog, '#000', 0.3));
  v.rect(0, 196, W, 2, mix(th.fog, '#8a7a6a', 0.3));
}

// A crowd member is a head and shoulders with an id. They stand in rows
// behind the far ropes and in banks down both sides of the ring.
function makeCrowd(id, th, rnd) {
  const out = [];
  const rows = th.crowdRows;
  const yTop = id === 'garden' ? 60 : id === 'roof' ? 78 : 62;
  for (let r = 0; r < rows; r++) {
    const y = yTop + r * Math.round((100 - yTop) / rows) + 2;
    const sz = r / rows;
    for (let x = 4 + (r % 2) * 5; x < W; x += 10 + Math.floor(rnd() * 3)) {
      if (rnd() < th.sparse) continue;
      out.push(person(x + rnd() * 3, y, 0.75 + sz * 0.35, mix(th.fog, '#000', 0) , 0.55 - sz * 0.4, rnd));
    }
  }
  // the side banks, either side of the ring and in front of the far crowd
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 6; k++) {
      const y = 111 + k * 13;
      const xl = 6 + r * 13 - k * 2, xr = W - 8 - r * 13 + k * 2;
      if (rnd() > th.sparse) out.push(person(xl, y, 1.1, th.fog, 0.15, rnd));
      if (rnd() > th.sparse) out.push(person(xr, y, 1.1, th.fog, 0.15, rnd));
    }
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}
function person(x, y, size, fog, fogT, rnd) {
  const sk = SKINS[Math.floor(rnd() * SKINS.length)];
  return {
    x, y, size, fogT, fog,
    skin: sk, shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)], hair: HAIRS[Math.floor(rnd() * HAIRS.length)],
    hat: rnd() < 0.18, bald: rnd() < 0.15, ph: rnd() * 6.28, hype: 0.4 + rnd() * 0.6, sign: rnd() < 0.05 ? Math.floor(rnd() * 3) : -1,
  };
}
function makeFront(rnd, th) {
  const out = [];
  for (let x = -6; x < W + 10; x += 20 + Math.floor(rnd() * 10)) {
    out.push({ x, y: 209 + Math.floor(rnd() * 5), r: 6 + Math.floor(rnd() * 3), ph: rnd() * 6.28, hat: rnd() < 0.2, phone: rnd() < 0.12 });
  }
  return out;
}

// ------------------------------------------------------------ the ring ---
function paintRingFloor(v, th, id, rnd) {
  const c = (x, z) => proj(x, z);
  const corners = [c(FX0, FZ1), c(FX1, FZ1), c(FX1, FZ0), c(FX0, FZ0)];
  // the apron skirt hangs down from the near edge and both sides
  const ap = 11;
  const [bl, br, fr, fl] = corners;
  v.poly([fl, fr, [fr[0] + 4, fr[1] + ap], [fl[0] - 4, fl[1] + ap]], P.ink);
  v.poly([[fl[0] + 1, fl[1] + 1], [fr[0] - 1, fr[1] + 1], [fr[0] + 3, fr[1] + ap - 1], [fl[0] - 3, fl[1] + ap - 1]], th.apron);
  v.poly([fr, br, [br[0] + 3, br[1] + ap], [fr[0] + 4, fr[1] + ap]], shade(th.apron, 0.35));
  v.poly([bl, fl, [fl[0] - 4, fl[1] + ap], [bl[0] - 3, bl[1] + ap]], shade(th.apron, 0.35));
  text(v, th.logo, 192, fl[1] + 3, th.apronText, { align: 'center' });
  text(v, '*', 108, fl[1] + 3, th.apronText); text(v, '*', 272, fl[1] + 3, th.apronText);
  // the canvas: a border band and the mat
  v.poly(corners, P.ink);
  v.poly(corners.map((p, i) => [p[0] + (i === 0 || i === 3 ? 1 : -1), p[1] + (i < 2 ? 1 : -1)]), th.canvas[2]);
  const m = 7;
  const inner = [c(FX0 + m, FZ1 - m * 0.6), c(FX1 - m, FZ1 - m * 0.6), c(FX1 - m, FZ0 + m * 0.6), c(FX0 + m, FZ0 + m * 0.6)];
  v.poly(inner, th.canvas[0]);
  // the mat sags and shines: lighter in the middle, scuffed, a little sweat
  v.dither(inner[3][0], inner[0][1], inner[2][0] - inner[3][0], inner[2][1] - inner[0][1], 'rgba(0,0,0,0)', th.canvas[1], 0.12);
  for (let i = 0; i < 70; i++) {
    const x = FX0 + 10 + rnd() * (FX1 - FX0 - 20), z = FZ0 + 5 + rnd() * (FZ1 - FZ0 - 10);
    const p = c(x, z);
    v.rect(p[0], p[1], 2 + Math.floor(rnd() * 3), 1, rnd() < 0.5 ? th.canvas[1] : light(th.canvas[0], 0.12));
  }
  // centre logo
  const ctr = c(0, 38);
  for (let r = 0; r < 2; r++) {
    const rx = 34 - r * 3, rz = 11 - r * 1;
    const pts = [];
    for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2; pts.push([ctr[0] + Math.cos(t) * rx, ctr[1] + Math.sin(t) * rz]); }
    v.poly(pts, r ? light(th.canvas[0], 0.08) : th.canvas[1]);
  }
  text(v, th.logo, ctr[0], ctr[1] - 3, mix(th.canvas[0], th.canvas[2], 0.75), { align: 'center' });
}

// THE DOHYO: a raised square of packed clay, the straw circle sunk into it,
// two white lines where the men crouch. The straw is drawn in two halves -
// the far half behind the wrestlers, the near half over their feet.
import { DOHYO } from './sumo.js';
function paintDohyo(v, th, rnd) {
  const c = (x, z) => proj(x, z);
  const corners = [c(-128, 80), c(128, 80), c(128, -4), c(-128, -4)];
  const [bl, br, fr, fl] = corners;
  const ap = 14;
  // the mound's sides
  v.poly([fl, fr, [fr[0] + 6, fr[1] + ap], [fl[0] - 6, fl[1] + ap]], P.ink);
  v.poly([[fl[0] + 1, fl[1] + 1], [fr[0] - 1, fr[1] + 1], [fr[0] + 5, fr[1] + ap - 1], [fl[0] - 5, fl[1] + ap - 1]], '#a07a4e');
  for (let k = 3; k < ap; k += 4) { const t = k / ap; v.line(fl[0] - 6 * t, fl[1] + k, fr[0] + 6 * t, fr[1] + k, '#8a663e'); }
  v.poly([fr, br, [br[0] + 5, br[1] + ap], [fr[0] + 6, fr[1] + ap]], '#7a5a36');
  v.poly([bl, fl, [fl[0] - 6, fl[1] + ap], [bl[0] - 5, bl[1] + ap]], '#7a5a36');
  // the top: clay, raked smooth, a little sand
  v.poly(corners, P.ink);
  v.poly(corners.map((p, i) => [p[0] + (i === 0 || i === 3 ? 1 : -1), p[1] + (i < 2 ? 1 : -1)]), th.canvas[1]);
  const inner = ellipsePts(DOHYO.rx + 6, DOHYO.rz + 2.5, 64);
  v.poly(inner, th.canvas[0]);
  for (let i = 0; i < 160; i++) {
    const x = -124 + rnd() * 248, z = -2 + rnd() * 80; const p = c(x, z);
    v.rect(p[0], p[1], 1 + Math.floor(rnd() * 2), 1, rnd() < 0.5 ? th.canvas[2] : light(th.canvas[0], 0.15));
  }
  // the shikiri lines
  for (const sx of [-10, 10]) { const a = c(sx, 32), b = c(sx, 44); v.line(a[0], a[1], b[0], b[1], '#fff8ea', 2); }
}
function ellipsePts(rx, rz, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push(proj(DOHYO.cx + Math.cos(t) * rx, DOHYO.cz + Math.sin(t) * rz)); }
  return pts;
}
// the straw bales (tawara), as a chain of short fat segments around the ring
function tawara(v, half) {
  const n = 56;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * Math.PI * 2, t1 = (i + 0.82) / n * Math.PI * 2;
    const far = Math.sin(t0) > 0;
    if ((half === 'far') !== far) continue;
    const a = proj(DOHYO.cx + Math.cos(t0) * DOHYO.rx, DOHYO.cz + Math.sin(t0) * DOHYO.rz);
    const b = proj(DOHYO.cx + Math.cos(t1) * DOHYO.rx, DOHYO.cz + Math.sin(t1) * DOHYO.rz);
    v.line(a[0], a[1] - 1, b[0], b[1] - 1, P.ink, 5);
    v.line(a[0], a[1] - 1, b[0], b[1] - 1, '#c8b070', 3);
    v.line(a[0], a[1] - 2, b[0], b[1] - 2, '#e8d498', 1);
  }
}

// posts at the four corners of the canvas, ropes strung between them
const POST_X = 124, POST_Z0 = 0, POST_Z1 = 76;
const ROPE_H = [9, 17, 25];

function post(v, x, z, col, near) {
  const [px, py] = proj(x, z);
  const h = 30;
  v.rect(px - 2, py - h, 5, h + 2, P.ink);
  v.rect(px - 1, py - h + 1, 3, h, near ? P.met1 : P.met2);
  v.rect(px + 1, py - h + 1, 1, h, P.met3);
  // turnbuckle pad
  v.rect(px - 3, py - h + 4, 7, 22, P.ink);
  v.rect(px - 2, py - h + 5, 5, 20, col);
  v.rect(px - 2, py - h + 5, 1, 20, light(col, 0.3));
  v.rect(px + 2, py - h + 5, 1, 20, shade(col, 0.3));
  v.rect(px - 2, py - h, 5, 2, P.met3);
}

function rope(v, x0, z0, x1, z1, i, col, sag, ink) {
  const a = proj(x0, z0), b = proj(x1, z1);
  const h = ROPE_H[i];
  const n = Math.max(2, Math.round(Math.abs(b[0] - a[0]) / 6));
  let px = a[0], py = a[1] - h;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const s = Math.sin(t * Math.PI) * sag;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - h + s;
    v.line(px, py + 1, x, y + 1, ink);
    v.line(px, py, x, y, col);
    px = x; py = y;
  }
}

export function drawRingBack(v, A, fight, now) {
  v.g.drawImage(A.ring, 0, 0);
  if (A.id === 'dohyo') { tawara(v, 'far'); return; }
  const th = A.th;
  // far posts and the far + side ropes, behind the fighters
  post(v, -POST_X, POST_Z1, th.posts[0], false);
  post(v, POST_X, POST_Z1, th.posts[1], false);
  const sagFar = ropeSag(fight, 'far'), sagL = ropeSag(fight, 'left'), sagR = ropeSag(fight, 'right');
  for (let i = 0; i < 3; i++) {
    rope(v, -POST_X, POST_Z1, POST_X, POST_Z1, i, th.ropes[i], sagFar, shade(th.ropes[i], 0.55));
    rope(v, -POST_X, POST_Z1, -POST_X, POST_Z0, i, shade(th.ropes[i], 0.1), 0, shade(th.ropes[i], 0.6));
    rope(v, POST_X, POST_Z1, POST_X, POST_Z0, i, shade(th.ropes[i], 0.1), 0, shade(th.ropes[i], 0.6));
  }
}
export function drawRingFront(v, A, fight, now) {
  if (A.id === 'dohyo') { tawara(v, 'near'); return; }
  const th = A.th;
  const sag = ropeSag(fight, 'near');
  for (let i = 0; i < 3; i++) rope(v, -POST_X, POST_Z0, POST_X, POST_Z0, i, th.ropes[i], sag, shade(th.ropes[i], 0.55));
  post(v, -POST_X, POST_Z0, th.posts[0] === th.posts[1] ? '#e8e0d0' : '#e8e0d0', true);
  post(v, POST_X, POST_Z0, '#e8e0d0', true);
  // the near side ropes' last stretch overlaps the near posts
}

// a fighter knocked into the ropes bends them
function ropeSag(fight, which) {
  if (!fight) return 0;
  let s = 0;
  for (const f of fight.f) {
    if (!f.rope) continue;
    if (which === 'left' && f.x < -100) s = Math.max(s, f.rope * 4);
    if (which === 'right' && f.x > 100) s = Math.max(s, f.rope * 4);
  }
  return s;
}

// --------------------------------------------------------------- crowd ---
export function drawCrowd(v, A, fight, now) {
  const hype = fight ? fight.crowd : 0.3;
  for (const p of A.crowd) {
    const cheer = hype * p.hype;
    const bob = cheer > 0.45 ? Math.abs(Math.sin(now * (7 + p.hype * 4) + p.ph)) * 2.5 * cheer : Math.sin(now * 1.3 + p.ph) * 0.6;
    const y = Math.round(p.y - bob), x = Math.round(p.x);
    const s = p.size;
    const fog = (c) => (p.fogT > 0 ? mix(c, p.fog, p.fogT) : c);
    const bw = Math.round(9 * s), bh = Math.round(7 * s), hr = Math.max(2, Math.round(2.6 * s));
    v.rect(x - Math.floor(bw / 2) - 1, y - 1, bw + 2, bh + 2, fog(P.ink));
    v.rect(x - Math.floor(bw / 2), y, bw, bh, fog(p.shirt));
    v.rect(x - Math.floor(bw / 2), y, bw, 1, fog(light(p.shirt, 0.2)));
    if (cheer > 0.6) {
      const up = Math.sin(now * 9 + p.ph) > 0;
      v.line(x - Math.floor(bw / 2), y + 1, x - Math.floor(bw / 2) - 2, y - 5 - (up ? 2 : 0), fog(p.skin[1]), 2);
      v.line(x + Math.floor(bw / 2), y + 1, x + Math.floor(bw / 2) + 2, y - 5 - (up ? 0 : 2), fog(p.skin[1]), 2);
    }
    v.disc(x, y - hr, hr + 1, fog(P.ink));
    v.disc(x, y - hr, hr, fog(p.skin[1]));
    if (p.hat) v.rect(x - hr, y - hr * 2 - 1, hr * 2 + 1, hr, fog('#2a2a3a'));
    else if (!p.bald) v.rect(x - hr, y - hr * 2, hr * 2 + 1, Math.max(1, hr - 1), fog(p.hair));
    if (p.sign >= 0 && cheer > 0.3) {
      v.rect(x - 7, y - hr * 2 - 9, 15, 7, fog(P.ink)); v.rect(x - 6, y - hr * 2 - 8, 13, 5, fog(['#fff2c0', '#ffd0d0', '#d0e8ff'][p.sign]));
      v.rect(x - 4, y - hr * 2 - 6, 9, 1, fog(['#c82828', '#2848c8', '#282828'][p.sign]));
    }
  }
  // camera flashes when it gets loud
  if (hype > 0.5) {
    const n = Math.floor(hype * 4);
    for (let i = 0; i < n; i++) {
      const k = Math.floor((now * 13 + i * 97) % A.crowd.length);
      const p = A.crowd[k];
      if (Math.sin(now * 31 + i * 7) > 0.6) {
        v.rect(p.x - 1, p.y - 6, 3, 3, '#ffffff'); v.rect(p.x - 3, p.y - 5, 7, 1, '#fff8d0'); v.rect(p.x, p.y - 8, 1, 7, '#fff8d0');
      }
    }
  }
}

export function drawBackdropFx(v, A, fight, now) {
  const id = A.id;
  if (id === 'pit') {
    // bulbs swinging on their cords
    for (const [x, len] of [[96, 22], [192, 26], [288, 22]]) {
      const sw = Math.sin(now * 1.1 + x) * 2;
      v.line(x, 9, x + sw, 9 + len, P.ink2);
      v.disc(x + sw, 11 + len, 3, '#fff0b8'); v.rect(x + sw - 1, 9 + len, 3, 2, '#4a4a50');
    }
  } else if (id === 'pier') {
    // string lights: a catenary of coloured bulbs, gently blinking
    for (let s = 0; s < 3; s++) {
      const x0 = s * 128, x1 = x0 + 128;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, x = x0 + (x1 - x0) * t, y = 10 + Math.sin(t * Math.PI) * 14;
        v.rect(Math.round(x), Math.round(y), 1, 1, P.ink);
        if (i % 2 === 0) {
          const on = Math.sin(now * 2 + i * 1.7 + s) > -0.6;
          v.rect(Math.round(x) - 1, Math.round(y) + 1, 3, 3, on ? ['#ffd36b', '#ff7a5a', '#7ad0ff', '#9ce85b'][(i / 2 + s) % 4] : '#4a4040');
        }
      }
    }
  } else if (id === 'casino') {
    const on = (k) => Math.sin(now * 5 + k * 2.1) > -0.85 || Math.sin(now * 23 + k) > 0.2;
    if (on(1)) { text(v, 'LUCKY', 62, 28, '#ff3d7f', { align: 'center', scale: 2, outline: '#5a0e2a' }); }
    if (on(2)) { text(v, '777', 322, 28, '#7ae8ff', { align: 'center', scale: 2, outline: '#0e3a5a' }); }
    if (on(3)) v.rect(20, 46, 84, 1, '#ffd84a');
    if (on(4)) v.rect(280, 46, 84, 1, '#ffd84a');
  } else if (id === 'roof') {
    // lanterns strung across, swaying
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 43, y = 22 + Math.sin(i * 0.8) * 4, sw = Math.sin(now * 1.4 + i) * 1.2;
      if (i < 8) v.line(x, y - 3, x + 43, 22 + Math.sin((i + 1) * 0.8) * 4 - 3, P.ink2);
      v.rect(x - 3 + sw, y, 7, 8, P.ink); v.rect(x - 2 + sw, y + 1, 5, 6, '#e8302c'); v.rect(x - 1 + sw, y + 2, 2, 3, '#ff9a6a');
    }
  } else if (id === 'wbowl') {
    // the big screen shows the match, and the pyro goes off when it gets loud
    if (fight) {
      const [a, b] = fight.f;
      // the screen sits behind the clock, so the names go on the lower half
      text(v, a.name.split(' ').slice(-1)[0], 183, 36, '#ff7a7a', { align: 'right' });
      text(v, 'VS', 192, 36, Math.sin(now * 4) > 0 ? '#ffd84a' : '#ffffff', { align: 'center' });
      text(v, b.name.split(' ').slice(-1)[0], 202, 36, '#7ab0ff', { align: 'left' });
      if (fight.crowd > 0.8) {
        for (const x of [112, 268]) for (let i = 0; i < 6; i++) {
          const h = ((now * 90 + i * 13) % 26);
          v.rect(x - 2 + Math.sin(now * 30 + i) * 2, 28 - h, 3, 3, i % 2 ? '#ffd84a' : '#ff5a2a');
        }
      }
    }
  } else if (id === 'dohyo') {
    // tassels sway a little
  } else if (id === 'garden') {
    // the jumbotron shows the fighters' names and the clock
    if (fight) {
      const [a, b] = fight.f;
      text(v, a.name.split(' ').slice(-1)[0], 192, 5, '#ff8a7a', { align: 'center' });
      text(v, 'VS', 192, 12, '#ffffff', { align: 'center' });
      text(v, b.name.split(' ').slice(-1)[0], 192, 19, '#7ab0ff', { align: 'center' });
    }
  } else if (id === 'rec') {
    // nothing moves at the rec but the fluorescent flicker
    if (Math.sin(now * 17) > 0.97) v.rect(126, 3, 40, 3, '#9aa89a');
  }
}

// light pools and darkness: drawn over the ring and fighters, under the HUD
export function drawLighting(v, A, now) {
  const th = A.th;
  if (A.id === 'garden' || A.id === 'wbowl') {
    // four beams converging on the ring
    for (const [x0, ph] of [[40, 0], [130, 1.3], [254, 2.2], [344, 3.1]]) {
      const tx = 192 + Math.sin(now * 0.5 + ph) * 60;
      v.g.globalAlpha = 0.08;
      v.poly([[x0 - 3, 0], [x0 + 3, 0], [tx + 30, 160], [tx - 30, 160]], '#e8f0ff');
      v.g.globalAlpha = 1;
    }
  }
  if (A.id === 'pit') {
    v.g.globalAlpha = 0.07;
    for (const x of [96, 192, 288]) v.poly([[x - 2, 36], [x + 2, 36], [x + 50, 180], [x - 50, 180]], '#ffe8a0');
    v.g.globalAlpha = 1;
  }
  if (th.dark > 0) {
    // vignette: corners fall off into the arena's own dark
    const d = th.dark;
    v.g.globalAlpha = d * 0.55;
    v.rect(0, 0, 40, H, th.fog); v.rect(W - 40, 0, 40, H, th.fog);
    v.g.globalAlpha = d * 0.35;
    v.rect(40, 0, 30, H, th.fog); v.rect(W - 70, 0, 30, H, th.fog);
    v.rect(0, 0, W, 24, th.fog);
    v.g.globalAlpha = 1;
  }
}

// the front row, in silhouette, across the bottom of the screen
const SIL = '#221a28';
export function drawFrontRow(v, A, fight, now) {
  const hype = fight ? fight.crowd : 0.3;
  const rim = A.th.light;
  for (const p of A.front) {
    const b = hype > 0.5 ? Math.abs(Math.sin(now * 8 + p.ph)) * 3 * hype : Math.sin(now * 1.2 + p.ph);
    const x = p.x, y = Math.round(p.y - b);
    v.disc(x, y + 14, p.r + 7, SIL);
    v.disc(x, y, p.r, SIL);
    v.rect(x - p.r + 1, y - p.r, p.r * 2 - 2, 1, mix(SIL, rim, 0.4));
    v.rect(x - p.r, y - p.r + 1, 1, 3, mix(SIL, rim, 0.25)); v.rect(x + p.r - 1, y - p.r + 1, 1, 3, mix(SIL, rim, 0.25));
    if (p.hat) v.rect(x - p.r - 2, y - 3, p.r * 2 + 5, 2, SIL);
    if (hype > 0.75) {
      const up = Math.sin(now * 10 + p.ph) > 0 ? 3 : 0;
      v.line(x - p.r - 3, y + 6, x - p.r - 5, y - 10 - up, SIL, 4);
      v.line(x + p.r + 3, y + 6, x + p.r + 5, y - 10 - (3 - up), SIL, 4);
    }
    if (p.phone) {
      v.rect(x + 2, y - 14, 6, 9, SIL); v.rect(x + 3, y - 13, 4, 6, '#7ab8ff');
      if (Math.sin(now * 3 + p.ph) > 0.97) { v.rect(x + 3, y - 13, 4, 6, '#ffffff'); }
    }
  }
}
