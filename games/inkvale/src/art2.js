// art2.js - the towers and creatures added with the three-path upgrades:
// lodges, thorn huts, raider camps, stables, lenses, frost spires, kilns,
// cauldrons, the beast dens, and the beasts themselves (wolves, drakes to
// dragons, bears to mammoths, vipers to hydras) plus horse riders.
//
// Each family is one parametric drawing; the tier grows it.

import { leafClump } from './sprites.js';
const TAU = Math.PI * 2;
const WOOD = '#8a6a48', WOOD_D = '#6a4e34', STONE = '#b9b0a2', STONE_D = '#8f877b';

function base(p, col = '#a08560', w = 27) {
  p.wash(0, 2, w + 3, 11, '#3a2a20', 0.18);
  p.ell(0, 0, w, 10, col, { hi: false });
}
function flag(p, x, y, col, h = 12) {
  p.line([[x, y], [x, y - h - 6]], 0.7, '#4a3a2a');
  p.poly([[x, y - h - 6], [x + 8, y - h - 4], [x + 6, y - h], [x + 8, y - h + 3], [x, y - h + 1]], col, { hi: false });
}
function courses(p, x0, y0, x1, y1, rows = 3) {
  const h = (y1 - y0) / rows;
  for (let r = 1; r < rows; r++) p.line([[x0 + 1, y0 + r * h], [x1 - 1, y0 + r * h]], 0.35, '#6a6258', { alpha: 0.5 });
}

// ------------------------------------------------------------------ towers
export function drawTower2(p, id) {
  const tier = +id.slice(-1) || 1;
  const k = 0.82 + tier * 0.09;
  const path = id.replace(/\d$/, '');
  switch (path) {
    case 'warden': return lodge(p, tier, k);
    case 'venom': return thornHut(p, tier, k);
    case 'raider': return raiderCamp(p, tier, k);
    case 'rider': return stables(p, tier, k);
    case 'lens': return lensSpire(p, tier, k);
    case 'frost': return frostSpire(p, tier, k);
    case 'spark': return sparkKiln(p, tier, k);
    case 'fire': return cauldron(p, tier, k);
    case 'beast': return kennel(p);
    case 'drake': return roost(p, tier, k);
    case 'bear': return den(p, tier, k);
    case 'serpent': return pit(p, tier, k);
  }
  return false;
}

function lodge(p, tier, k) {
  base(p, '#8a8a58');
  if (tier >= 4) { p.poly([[-24, 0], [24, 0], [22, -8], [-22, -8]], STONE); courses(p, -23, -8, 23, 0, 2); }
  const y0 = tier >= 4 ? -8 : 0;
  p.poly([[-20 * k, y0], [20 * k, y0], [20 * k, y0 - 16 * k], [-20 * k, y0 - 16 * k]], WOOD);
  for (let i = -16; i <= 16; i += 4) p.line([[i * k, y0], [i * k, y0 - 16 * k]], 0.4, WOOD_D, { alpha: 0.6 });
  p.poly([[-25 * k, y0 - 14 * k], [0, y0 - 36 * k], [25 * k, y0 - 14 * k]], '#4f6b3a');
  p.poly([[-4, y0], [4, y0], [4, y0 - 10], [-4, y0 - 10]], '#3a2a1e', { hi: false });
  // antlers over the door and a straw target
  p.line([[0, y0 - 30 * k], [-6, y0 - 38 * k], [-10, y0 - 37 * k]], 1, '#e0d2b0').line([[0, y0 - 30 * k], [6, y0 - 38 * k], [10, y0 - 37 * k]], 1, '#e0d2b0');
  p.ell(-26, -6, 5, 6, '#d8b860');
  p.ell(-26, -6, 3, 3.6, '#c4433a', { shadow: false });
  p.ell(-26, -6, 1.2, 1.4, '#f3e9d2', { shadow: false });
  flag(p, 18 * k, y0 - 14 * k, '#4f7a3a', 10 + tier * 2);
}
function thornHut(p, tier, k) {
  base(p, '#7d8a55');
  p.poly([[-12 * k, 0], [12 * k, 0], [9 * k, -22 * k], [-9 * k, -22 * k]], '#6a4a34');
  for (const [x, y, rx, ry, c] of [[-10, -30, 11, 8, '#4a6a34'], [10, -31, 11, 8, '#55783a'], [0, -38, 12, 8, '#5f8a42']]) p.shape(leafClump(x * k, y * k, rx * k, ry * k, p.R, 9), c);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; p.line([[Math.cos(a) * 14 * k, -32 * k + Math.sin(a) * 9 * k], [Math.cos(a) * 19 * k, -32 * k + Math.sin(a) * 12 * k]], 0.7, '#3a4a2a'); }
  for (let i = 0; i < 5 + tier; i++) p.dot((i * 7 % 22 - 11) * k, (-28 - (i * 5) % 14) * k, 1.4, '#7a3aa0');
  // poison vat
  p.poly([[14, 0], [24, 0], [23, -9], [15, -9]], '#5a5048');
  p.ell(19, -9, 4.5, 1.8, '#7ac04a', { shadow: false });
  p.glow(19, -10, 8, '#9af060', 0.35);
}
function raiderCamp(p, tier, k) {
  base(p, '#8a7a55');
  if (tier >= 3) {
    p.poly([[-24, 0], [24, 0], [22, -16], [-22, -16]], '#7a5a3c');
    for (let x = -20; x <= 20; x += 5) p.line([[x, 0], [x, -16]], 0.45, '#4a3424', { alpha: 0.6 });
    p.poly([[-28, -14], [0, -34], [28, -14]], '#6a5a3a');
    p.poly([[-5, 0], [5, 0], [5, -11], [-5, -11]], '#2e2218', { hi: false });
  } else {
    p.poly([[-22, 0], [-6, -26], [10, 0]], '#a08a68');
    p.poly([[2, 0], [14, -20], [24, 0]], '#8a7458');
    p.poly([[-9, 0], [-6, -10], [-3, 0]], '#3a2a1e', { hi: false });
  }
  // totem with a skull
  p.limb(-26, 2, -26, -22 * k, 2.4, WOOD_D);
  p.ell(-26, -24 * k, 3.4, 3.2, '#e6dcc4');
  p.dot(-27.2, -24.5 * k, 0.8, '#2a2230').dot(-24.8, -24.5 * k, 0.8, '#2a2230');
  flag(p, 22, -14, '#8c3a2e', 8 + tier * 2);
}
function stables(p, tier, k) {
  base(p, '#9a8a60', 28);
  const st = tier >= 4;
  p.poly([[-24 * k, 0], [24 * k, 0], [24 * k, -16 * k], [-24 * k, -16 * k]], st ? STONE : WOOD);
  if (st) courses(p, -24 * k, -16 * k, 24 * k, 0, 2);
  else for (let x = -20; x <= 20; x += 5) p.line([[x * k, 0], [x * k, -16 * k]], 0.4, WOOD_D, { alpha: 0.6 });
  p.poly([[-28 * k, -14 * k], [-20 * k, -28 * k], [20 * k, -28 * k], [28 * k, -14 * k]], '#a8523a');
  // half door with a horse looking out
  p.poly([[-6, 0], [6, 0], [6, -11], [-6, -11]], '#3a2a1e', { hi: false });
  p.poly([[-3, -7], [3, -12], [7, -10], [6, -6], [1, -4]], '#8a5a3a');
  p.dot(4.5, -10.2, 0.6, '#1a1218');
  p.poly([[-6, -4], [6, -4], [6, 0], [-6, 0]], WOOD_D, { hi: false });
  // hay and a horseshoe sign
  p.ell(-17 * k, -3, 5, 3.4, '#e0c060');
  p.line([[14 * k, -22 * k], [14 * k, -28 * k]], 0.8, '#5a4030');
  p.poly([[11 * k, -31 * k], [17 * k, -31 * k], [17 * k, -25 * k], [11 * k, -25 * k]], '#c8b080', { hi: false });
  if (tier >= 3) flag(p, -22 * k, -26 * k, '#3e64a8', 10 + tier * 2);
  if (st) flag(p, 22 * k, -26 * k, '#3e64a8', 14);
}
function lensSpire(p, tier, k) {
  base(p, '#a8a0b0');
  const h = 22 + tier * 7;
  p.poly([[-13 * k, 0], [13 * k, 0], [10 * k, -h], [-10 * k, -h]], '#d8d4e4');
  courses(p, -12 * k, -h, 12 * k, 0, 3);
  if (tier === 2) {
    p.line([[-8, -h], [0, -h - 12]], 1, '#8a7a5a').line([[8, -h], [0, -h - 12]], 1, '#8a7a5a');
    p.ell(0, -h - 14, 7, 7, '#cfe6ff');
    p.ell(-2, -h - 16, 2.5, 2.5, '#ffffff', { shadow: false });
  } else {
    p.poly([[-7, -h], [7, -h], [0, -h - 22]], '#cfe6ff');
    p.poly([[0, -h - 22], [7, -h], [2, -h - 4]], '#9ac0e8', { hi: false });
  }
  p.glow(0, -h - 12, 18, '#e8f4ff', 0.35);
}
function frostSpire(p, tier, k) {
  base(p, '#a8b8c0');
  const h = 26 + tier * 8;
  p.poly([[-14 * k, 0], [14 * k, 0], [10 * k, -h], [-10 * k, -h]], '#c8dce8');
  courses(p, -13 * k, -h, 13 * k, 0, 4);
  p.poly([[-4, 0], [4, 0], [4, -9], [0, -12], [-4, -9]], '#3a4a5a', { hi: false });
  // icicles under the eaves and a cap of ice
  for (let x = -10; x <= 10; x += 4) p.poly([[x - 1.2, -h], [x + 1.2, -h], [x, -h + 5 + (x % 3)]], '#e8f6ff', { shadow: false });
  if (tier >= 4) {
    // the royal hourglass
    p.poly([[-9, -h - 2], [9, -h - 2], [9, -h - 5], [-9, -h - 5]], '#d8b24a');
    p.poly([[-7, -h - 5], [7, -h - 5], [1, -h - 15], [7, -h - 25], [-7, -h - 25], [-1, -h - 15]], '#e8f6ff');
    p.poly([[-4, -h - 7], [4, -h - 7], [0, -h - 12]], '#e0c070', { shadow: false });
    p.poly([[-9, -h - 25], [9, -h - 25], [9, -h - 28], [-9, -h - 28]], '#d8b24a');
    p.glow(0, -h - 15, 20, '#bfe8ff', 0.4);
  } else {
    p.poly([[-10, -h], [10, -h], [0, -h - 18 - tier * 3]], '#9fd3ef');
    p.glow(0, -h - 8, 14, '#bfe8ff', 0.35);
  }
}
function sparkKiln(p, tier, k) {
  base(p, '#8a8070');
  p.poly([[-20 * k, 0], [20 * k, 0], [18 * k, -14 * k], [-18 * k, -14 * k]], '#9a6a4a');
  p.ell(0, -26 * k, 15 * k, 14 * k, '#b06a46');
  p.poly([[-4, -10], [4, -10], [4, -17], [-4, -17]], '#3a2018', { hi: false });
  p.glow(0, -14, 5, '#ffb060', 0.6);
  const coils = tier === 2 ? [0] : [-1, 1];
  for (const s of coils) {
    const x = s * 13 * k;
    p.line([[x, -32 * k], [x + s * 4, -44 * k]], 1.5, '#b87333');
    for (let i = 0; i < 3; i++) p.ell(x + s * i, -34 * k - i * 3, 2.4, 0.9, '#d08a4a', { shadow: false });
    p.dot(x + s * 4, -45 * k, 1.8, '#9fd3ff');
  }
  p.glow(0, -44 * k, 10, '#9fd3ff', 0.4);
}
function cauldron(p, tier, k) {
  base(p, '#8a7a68');
  // stone fire pit
  p.poly([[-20 * k, 0], [20 * k, 0], [18 * k, -10 * k], [-18 * k, -10 * k]], STONE_D);
  courses(p, -19 * k, -10 * k, 19 * k, 0, 2);
  p.glow(0, -8 * k, 14 * k, '#ff7a30', 0.55);
  for (const x of [-8, 0, 8]) p.poly([[x - 3, -9 * k], [x, -18 * k], [x + 3, -9 * k]], '#f0a040', { shadow: false });
  // the cauldron
  p.ell(0, -22 * k, 15 * k, 11 * k, '#2e2a30');
  p.ell(0, -30 * k, 14 * k, 3.6 * k, '#1a1424');
  p.ell(-3, -30.5 * k, 6, 1.4, '#6a3a8a', { shadow: false });
  if (tier >= 4) {
    // dragon-head spout
    p.poly([[13 * k, -26 * k], [24 * k, -32 * k], [27 * k, -28 * k], [22 * k, -24 * k], [14 * k, -20 * k]], '#3a3440');
    p.dot(22 * k, -30 * k, 1, '#ff8040');
  }
  for (const s of [-1, 1]) p.limb(s * 14 * k, -24 * k, s * 17 * k, -16 * k, 2, '#3a3440');
  p.glow(0, -34 * k, 12, '#c060ff', 0.25);
}
function kennel(p) {
  base(p, '#9a8a60');
  p.poly([[-16, 0], [16, 0], [16, -14], [-16, -14]], WOOD);
  for (let x = -12; x <= 12; x += 4) p.line([[x, 0], [x, -14]], 0.4, WOOD_D, { alpha: 0.6 });
  p.poly([[-20, -12], [0, -28], [20, -12]], '#a8523a');
  p.poly([[-6, 0], [6, 0], [6, -8], [0, -12], [-6, -8]], '#2a1e16', { hi: false });
  p.line([[16, -2], [26, -2]], 1.6, '#e6dcc4');
  p.dot(16, -2, 1.6, '#e6dcc4').dot(26, -2, 1.6, '#e6dcc4');
  p.ell(-22, -2, 5, 2.4, '#8a7a5a');
}
function roost(p, tier, k) {
  base(p, '#8a8070', 28);
  // a crag of rock
  p.poly([[-22 * k, 0], [-16 * k, -24 * k], [-6 * k, -34 * k], [6 * k, -38 * k], [16 * k, -26 * k], [22 * k, 0]], '#7a7068');
  p.poly([[-6 * k, -34 * k], [6 * k, -38 * k], [10 * k, -20 * k], [-2 * k, -12 * k]], '#8f857a', { shadow: false });
  // the nest on top
  p.ell(0, -38 * k, 14 * k, 5 * k, '#9a7a4a');
  for (let i = -10; i <= 10; i += 3) p.line([[i * k, -40 * k], [(i + 4) * k, -36 * k]], 0.6, '#6a4e34');
  for (const x of [-4, 3]) p.ell(x * k, -41 * k, 3, 3.6, tier >= 3 ? '#4a3a68' : '#c8b8a0');
  if (tier >= 4) {
    // a dragon skull and a scatter of gold
    p.poly([[-22, -6], [-12, -12], [-8, -8], [-12, -2], [-22, -2]], '#e6dcc4');
    p.dot(-14, -8, 1.2, '#2a2230');
    for (let i = 0; i < 6; i++) p.dot(8 + i * 2.5, -3 - (i % 2) * 2, 1.4, '#e0b440');
    flag(p, 18 * k, -24 * k, '#2a2236', 14);
  }
  if (tier >= 3) p.glow(0, -40 * k, 14, '#ff9a50', 0.25);
}
function den(p, tier, k) {
  base(p, '#8a8068', 30);
  p.poly([[-26 * k, 0], [-20 * k, -18 * k], [-6 * k, -28 * k], [10 * k, -27 * k], [22 * k, -16 * k], [26 * k, 0]], '#857a6a');
  p.poly([[-10 * k, 0], [-8 * k, -12 * k], [0, -17 * k], [8 * k, -12 * k], [10 * k, 0]], '#1e1814', { hi: false });
  p.wash(-12 * k, -24 * k, 8, 3, '#5a7a3a', 0.4);
  if (tier >= 4) {
    // tusks framing the door
    p.poly([[-14, 0], [-16, -10], [-10, -16], [-12, -8]], '#efe6d0');
    p.poly([[14, 0], [16, -10], [10, -16], [12, -8]], '#efe6d0');
    flag(p, 20 * k, -16 * k, '#8c3a2e', 12);
  }
  for (const x of [-20, 22]) p.ell(x, -2, 4, 2.4, '#9a958c', { shadow: false });
}
function pit(p, tier, k) {
  base(p, '#7a7a58', 30);
  p.ell(0, -3, 22 * k, 8 * k, tier >= 4 ? '#3a5040' : '#4a3a2a');
  p.ell(0, -4, 17 * k, 5.5 * k, tier >= 4 ? '#2a4a3a' : '#1e1814', { shadow: false });
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; p.ell(Math.cos(a) * 22 * k, -3 + Math.sin(a) * 8 * k, 3.4, 2.4, '#9a958c'); }
  for (const x of [-18, 18]) for (let j = 0; j < 4; j++) p.line([[x + j * 2, -4], [x + j * 2 + (j - 1.5), -14 - j * 2]], 0.7, '#6a7a42');
  // a coil showing above the murk
  p.poly([[-6, -6], [-2, -14 - tier * 2], [4, -16 - tier * 2], [6, -8]], tier >= 4 ? '#3a6a4a' : '#6a7a3a');
  if (tier >= 3) p.glow(0, -10, 14, '#a0f070', 0.2);
}

// ------------------------------------------------------------------ creatures
export const OUTFIT2 = {
  warden: { body: '#4f6b3a', legs: '#5a4a38', head: 'hood', hat: '#3f5c32', weapon: 'bow', cape: '#3a5530', skin: '#e3b08a', belt: '#5a4330' },
  raider: { body: '#8a6a4a', legs: '#5b4636', head: 'bare', hair: '#8a4a2a', beard: '#8a4a2a', weapon: 'axe', skin: '#e6b08e', belt: '#3a2c22', thick: 1.05 },
};

export const UNIT_BOX2 = {
  rider: [64, 58, 30, 52], lancer: [70, 62, 32, 56], wolf: [56, 40, 26, 36],
  drake: [70, 60, 35, 50], wyvern: [90, 74, 45, 62], dragon: [120, 96, 60, 80],
  bear: [62, 50, 30, 46], direbear: [74, 60, 36, 56], mammoth: [96, 84, 46, 78],
  viper: [60, 34, 30, 28], basilisk: [74, 44, 36, 38], hydra: [90, 76, 44, 68],
};

export function drawCreature2(p, kind, ph, atk, humanoid, OUTFIT) {
  const g = p.g;
  const walk = Math.sin(ph * TAU);
  switch (kind) {
    case 'rider': case 'lancer': {
      horse(p, ph, atk, kind === 'lancer' ? '#5a3a2a' : '#8a5a3a', kind === 'lancer');
      g.save(); g.translate(-1, -15 + Math.abs(walk) * 0.8);
      const o = kind === 'lancer'
        ? { ...OUTFIT.knight, weapon: 'spear', scale: 0.92, noLegs: true, shield: { col: '#3e64a8', emblem: '#e2c16b' } }
        : { ...OUTFIT.footman, weapon: 'sword', scale: 0.9, noLegs: true, shield: null };
      humanoid(p, o, 0.25, atk);
      g.restore();
      return true;
    }
    case 'wolf': return quad(p, ph, atk, { len: 20, h: 9, col: '#7a7a80', belly: '#a8a8ae', head: 'wolf', tail: 'bush', legs: 2.6 }), true;
    case 'bear': return quad(p, ph, atk, { len: 26, h: 15, col: '#6a4a33', belly: '#8a6a4a', head: 'bear', tail: null, legs: 4.6 }), true;
    case 'direbear': return quad(p, ph, atk, { len: 32, h: 19, col: '#4a3a30', belly: '#6a5040', head: 'bear', tail: null, legs: 5.6, spikes: '#e6dcc4' }), true;
    case 'mammoth': return quad(p, ph, atk, { len: 44, h: 30, col: '#7a5a40', belly: '#9a7a5a', head: 'mammoth', tail: 'thin', legs: 8, armor: '#8c3a2e' }), true;
    case 'drake': return wyrm(p, ph, atk, { s: 0.8, col: '#a85a3a', wing: '#c87a4a', belly: '#e8c088', horns: 1 }), true;
    case 'wyvern': return wyrm(p, ph, atk, { s: 1.05, col: '#4a6a5a', wing: '#6a8a6a', belly: '#c8d0a0', horns: 2 }), true;
    case 'dragon': return wyrm(p, ph, atk, { s: 1.45, col: '#2a2236', wing: '#4a3a68', belly: '#d8b24a', horns: 3, glow: '#ff9a50' }), true;
    case 'viper': return snake(p, ph, atk, { len: 30, w: 4, col: '#6a8a3a', belly: '#d8d080', heads: 1 }), true;
    case 'basilisk': return snake(p, ph, atk, { len: 40, w: 6, col: '#4a6a4a', belly: '#c8c890', heads: 1, crown: '#c4433a', eyes: '#ffd060' }), true;
    case 'hydra': return snake(p, ph, atk, { len: 44, w: 9, col: '#2f5a44', belly: '#a8c890', heads: 3 }), true;
  }
  return false;
}

function horse(p, ph, atk, col, barded) {
  const run = Math.sin(ph * TAU), run2 = Math.cos(ph * TAU);
  const back = [-11, -14], front = [11, -14];
  const leg = (x, sw, dark) => {
    const c = dark ? '#3a2a20' : col;
    p.limb(x, -12, x + sw * 3, -6, 3.2, c);
    p.limb(x + sw * 3, -6, x + sw * 2, 0, 2.6, c);
    p.poly([[x + sw * 2 - 1.6, 0], [x + sw * 2 + 2, 0], [x + sw * 2 + 1.6, -1.6], [x + sw * 2 - 1.4, -1.6]], '#2a2020');
  };
  leg(back[0] + 2, -run, true); leg(front[0] - 2, run2, true);
  // tail
  p.poly([[-16, -18], [-24, -12 + run], [-22, -6 + run], [-17, -14]], '#2a2020');
  p.poly([[-16, -21], [14, -21], [17, -13], [13, -9], [-14, -9], [-18, -14]], col);
  if (barded) p.poly([[-12, -21], [10, -21], [11, -13], [-12, -13]], '#3e64a8', { hi: false });
  // neck and head
  p.poly([[10, -20], [17, -31], [21, -32], [24, -26], [19, -22], [15, -14]], col);
  p.poly([[19, -32], [26, -29], [27, -25], [22, -24]], col);
  p.poly([[15, -31], [16, -35], [18, -31]], col, { shadow: false });
  p.dot(21.5, -29.5, 0.7, '#1a1218');
  p.poly([[10, -21], [16, -30], [13, -26], [9, -19]], '#2a2020', { shadow: false });
  leg(back[0], run, false); leg(front[0], -run2, false);
}

function quad(p, ph, atk, o) {
  const run = Math.sin(ph * TAU), run2 = Math.cos(ph * TAU);
  const L = o.len, H = o.h, lw = o.legs;
  const hx = L * 0.55, bx = -L * 0.5;
  const leg = (x, sw, dark) => {
    const c = dark ? shadeHex(o.col, -0.25) : o.col;
    p.limb(x, -H * 0.55, x + sw * lw * 0.6, -H * 0.2, lw, c, { taper: 0.9 });
    p.limb(x + sw * lw * 0.6, -H * 0.2, x + sw * lw * 0.3, 0, lw * 0.9, c, { taper: 0.9 });
  };
  leg(bx + 3, -run * 0.8, true); leg(hx - 4, run2 * 0.8, true);
  if (o.tail === 'bush') p.poly([[bx - 2, -H * 0.9], [bx - 10, -H * 1.2 - run], [bx - 12, -H * 0.8], [bx - 4, -H * 0.6]], shadeHex(o.col, -0.1));
  if (o.tail === 'thin') p.line([[bx, -H * 0.8], [bx - 6, -H * 0.4 + run]], 1.4, shadeHex(o.col, -0.3));
  // body: a humped barrel
  p.poly([[bx, -H * 0.55], [bx + 2, -H * 1.05], [bx + L * 0.35, -H * 1.18], [hx, -H * 1.1], [hx + 3, -H * 0.6], [hx - 2, -H * 0.3], [bx + 3, -H * 0.3]], o.col);
  p.poly([[bx + 4, -H * 0.4], [hx - 4, -H * 0.4], [hx - 6, -H * 0.3], [bx + 6, -H * 0.3]], o.belly, { shadow: false });
  if (o.armor) { p.poly([[bx + 6, -H * 1.12], [hx - 6, -H * 1.12], [hx - 4, -H * 0.62], [bx + 4, -H * 0.62]], o.armor, { hi: false }); p.poly([[-4, -H * 1.12], [4, -H * 1.12], [4, -H * 1.5], [-4, -H * 1.5]], '#c8b080'); }
  if (o.spikes) for (let i = 0; i < 4; i++) p.poly([[bx + 6 + i * 6, -H * 1.12], [bx + 8 + i * 6, -H * 1.4], [bx + 10 + i * 6, -H * 1.12]], o.spikes, { shadow: false });
  // head
  const hy = -H * 0.95 + (atk ? 2 : 0);
  if (o.head === 'wolf') {
    p.poly([[hx, hy - 4], [hx + 6, hy - 6], [hx + 12, hy - 2], [hx + 11, hy + 1], [hx + 4, hy + 3]], o.col);
    p.poly([[hx + 2, hy - 5], [hx + 3, hy - 10], [hx + 6, hy - 6]], shadeHex(o.col, -0.2), { shadow: false });
    p.dot(hx + 7, hy - 3, 0.8, '#f0c060');
    if (atk) p.poly([[hx + 9, hy + 1], [hx + 12, hy + 4], [hx + 8, hy + 2]], '#c4433a', { shadow: false });
  } else if (o.head === 'bear') {
    const s = H / 15;
    p.ell(hx + 4 * s, hy, 7 * s, 6 * s, o.col);
    p.ell(hx + 10 * s, hy + 1.5 * s, 3.6 * s, 2.8 * s, o.belly);
    p.dot(hx + 12.5 * s, hy + 0.5 * s, 1.1 * s, '#1a1218');
    p.ell(hx, hy - 5 * s, 2.4 * s, 2.4 * s, o.col, { shadow: false });
    p.dot(hx + 6 * s, hy - 1.5 * s, 0.9 * s, '#1a1218');
    if (atk) p.poly([[hx + 8 * s, hy + 4 * s], [hx + 12 * s, hy + 6 * s], [hx + 7 * s, hy + 6 * s]], '#c4433a', { shadow: false });
  } else if (o.head === 'mammoth') {
    const s = H / 30;
    p.ell(hx + 4 * s, hy - 2 * s, 11 * s, 11 * s, o.col);
    p.poly([[hx - 6 * s, hy - 8 * s], [hx - 2 * s, hy - 12 * s], [hx + 2 * s, hy + 6 * s], [hx - 8 * s, hy + 4 * s]], shadeHex(o.col, -0.2));  // ear
    // trunk swings
    p.limb(hx + 10 * s, hy + 2 * s, hx + 14 * s + (atk ? 6 : 0), hy + 14 * s, 4.5 * s, o.col, { taper: 0.6 });
    p.limb(hx + 14 * s + (atk ? 6 : 0), hy + 14 * s, hx + 12 * s + (atk ? 10 : 0), hy + 22 * s - (atk ? 8 : 0), 3 * s, o.col, { taper: 0.6 });
    // tusks
    p.poly([[hx + 8 * s, hy + 6 * s], [hx + 22 * s, hy + 10 * s], [hx + 26 * s, hy + 2 * s], [hx + 22 * s, hy + 6 * s], [hx + 10 * s, hy + 3 * s]], '#f0e8d4');
    p.dot(hx + 8 * s, hy - 3 * s, 1.2 * s, '#1a1218');
  }
  leg(bx, run * 0.8, false); leg(hx - 6, -run2 * 0.8, false);
}

function wyrm(p, ph, atk, o) {
  const g = p.g;
  const flap = Math.sin(ph * TAU);
  g.save(); g.scale(o.s, o.s);
  const wy = flap * 12;
  const wing = (front) => {
    const c = front ? o.wing : shadeHex(o.wing, -0.3);
    const x0 = front ? 2 : -2, sgn = front ? 1 : 0.8;
    p.poly([[x0, -30], [x0 - 10, -46 - wy * sgn], [x0 - 26, -50 - wy * sgn], [x0 - 34, -38 - wy * 0.6], [x0 - 24, -36 - wy * 0.3], [x0 - 16, -30], [x0 - 6, -26]], c, { hi: false });
    for (const t of [0.35, 0.65]) p.line([[x0 - 2, -30], [x0 - 10 - 20 * t, -48 - wy * sgn + t * 6]], 0.5, shadeHex(o.col, -0.3));
  };
  wing(false);
  // tail
  p.poly([[-12, -26], [-30, -20], [-40, -24], [-44, -20], [-38, -18], [-28, -16], [-10, -20]], o.col);
  p.poly([[-44, -20], [-50, -24], [-48, -16]], shadeHex(o.col, -0.2), { shadow: false });
  // body
  p.poly([[-14, -24], [-6, -32], [10, -32], [16, -26], [12, -18], [-10, -18]], o.col);
  p.poly([[-8, -20], [10, -20], [11, -23], [-8, -23]], o.belly, { shadow: false });
  // legs tucked under (it flies)
  p.limb(-6, -20, -8, -12, 3, shadeHex(o.col, -0.2));
  p.limb(8, -20, 9, -12, 3, o.col);
  // neck and head
  const ha = atk ? 4 : Math.sin(ph * TAU * 0.5) * 1.5;
  p.poly([[10, -30], [20, -42 + ha], [26, -42 + ha], [24, -36 + ha], [16, -24]], o.col);
  p.poly([[20, -46 + ha], [32, -44 + ha], [36, -40 + ha], [30, -37 + ha], [21, -38 + ha]], o.col);
  if (atk) p.poly([[30, -38 + ha], [37, -36 + ha], [31, -35 + ha]], '#c4433a', { shadow: false });
  for (let i = 0; i < o.horns; i++) p.poly([[21 + i * 3, -45 + ha], [17 + i * 3, -53 - i + ha], [24 + i * 3, -45 + ha]], '#e6dcc4', { shadow: false });
  p.dot(27, -42.5 + ha, 1, o.glow || '#ffd060');
  if (o.glow) p.glow(34, -40 + ha, 8, o.glow, 0.35);
  wing(true);
  g.restore();
}

function snake(p, ph, atk, o) {
  const g = p.g;
  const n = 10, L = o.len, w = o.w;
  // body coils along a sine on the ground
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: -L / 2 + t * L * 0.8, y: -w * 0.6 + Math.sin(t * TAU * 1.2 + ph * TAU) * w * 0.6 });
  }
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = w * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.9));
    top.push({ x: pts[i].x, y: pts[i].y - ww * 0.6 });
    bot.push({ x: pts[i].x, y: pts[i].y + ww * 0.4 });
  }
  p.shape([...top, ...bot.reverse()], o.col);
  for (let i = 1; i < n; i += 2) p.dot(pts[i].x, pts[i].y - w * 0.15, w * 0.18, shadeHex(o.col, -0.25));
  // necks and heads rise from the front
  const hx = pts[n].x, hy = pts[n].y;
  const heads = o.heads;
  for (let h = 0; h < heads; h++) {
    const spread = heads > 1 ? (h - (heads - 1) / 2) : 0;
    const sway = Math.sin(ph * TAU + h * 1.7) * 2 + (atk ? 5 : 0);
    const nx = hx + 2 + spread * 13 + sway * 0.6, ny = hy - w * 1.6 - (heads > 1 ? 14 - Math.abs(spread) * 6 + h * 2 : 4);
    p.limb(hx, hy - w * 0.4, nx, ny, w * 0.8, o.col, { taper: 0.75 });
    const s = w / 6 + 0.4;
    p.poly([[nx - 3 * s, ny - 2 * s], [nx + 2 * s, ny - 4 * s], [nx + 8 * s, ny - 2 * s], [nx + 9 * s, ny + 1 * s], [nx + 2 * s, ny + 2.5 * s], [nx - 2 * s, ny + 2 * s]], o.col);
    p.poly([[nx + 1 * s, ny + 1.5 * s], [nx + 8 * s, ny + 0.5 * s], [nx + 2 * s, ny + 2.5 * s]], o.belly, { shadow: false });
    p.dot(nx + 3 * s, ny - 1.6 * s, 0.9 * s, o.eyes || '#ffd060');
    if (o.crown) for (let c = 0; c < 3; c++) p.poly([[nx - 2 * s + c * 2.5 * s, ny - 3 * s], [nx - 1 * s + c * 2.5 * s, ny - 7 * s], [nx + 0.5 * s + c * 2.5 * s, ny - 3 * s]], o.crown, { shadow: false });
    if (atk) p.line([[nx + 9 * s, ny + 0.5 * s], [nx + 12 * s, ny - 1 * s]], 0.6, '#c4433a');
  }
}

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}
