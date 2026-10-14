// Procedural pixel-art sprites (built once into small canvases, drawn nearest-neighbour).
import { hash, shade, mix } from './util.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function mk(w, h, fn) {
  const c = cv(w, h), x = c.getContext('2d');
  const R = (a, b, cw, ch, col) => { x.fillStyle = col; x.fillRect(a, b, cw, ch); };
  const P = (a, b, col) => R(a, b, 1, 1, col);
  fn(R, P, x);
  return c;
}
// 1px dark outline around opaque pixels
function outline(c, col = '#0a0d16') {
  const w = c.width, h = c.height, x = c.getContext('2d');
  const d = x.getImageData(0, 0, w, h).data;
  const o = cv(w, h), ox = o.getContext('2d');
  ox.fillStyle = col;
  const op = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 40;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!op(i, j) && (op(i - 1, j) || op(i + 1, j) || op(i, j - 1) || op(i, j + 1))) ox.fillRect(i, j, 1, 1);
  ox.drawImage(c, 0, 0);
  return o;
}
function flip(c) { const o = cv(c.width, c.height), x = o.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return o; }

export const S = {};

export function buildSprites() {
  // ---- diver (facing right), 4 kick frames, 24x13
  const suit = '#2456a0', suitHi = '#4a86d8', stripe = '#ffcc2e', tank = '#ffd23a', tankD = '#c08a1a', mask = '#86f3ff', maskD = '#2c7b96', fin = '#ff6a33', finD = '#b8401c', skin = '#eaa882';
  S.diver = [];
  for (let f = 0; f < 4; f++) {
    const o = [0, 1, 0, -1][f];
    const c = mk(24, 13, (R, P) => {
      R(9, 2, 8, 2, tank); R(9, 3, 8, 1, tankD); P(17, 2, tankD); P(8, 3, tankD);
      R(7, 4, 10, 3, suit); R(8, 4, 9, 1, suitHi); R(10, 5, 5, 1, stripe);
      R(17, 3, 4, 4, suit); P(17, 3, suitHi); R(19, 4, 2, 2, mask); P(19, 5, maskD); P(20, 6, skin); P(21, 6, tankD);
      R(15, 7, 4, 1, suit); P(19, 7, '#fff7c2');
      const ya = 4 + Math.max(0, o), yb = 6 - Math.max(0, -o);
      R(3, ya, 4, 1, suit); R(3, yb, 4, 1, suit);
      R(0, ya - (o > 0 ? 0 : 1), 3, 1, fin); P(0, ya - (o > 0 ? 0 : 1) + 1, finD); P(1, ya - (o > 0 ? 0 : 1) + 1, fin);
      R(0, yb + (o < 0 ? 0 : 1), 3, 1, fin); P(0, yb + (o < 0 ? 0 : 1) - 1, finD); P(1, yb + (o < 0 ? 0 : 1) - 1, fin);
    });
    const oc = outline(c);
    S.diver.push([oc, flip(oc)]);
  }
  // ---- survivors: 4 looks x 2 frames (arms down / waving), 9x13
  const looks = [
    { hair: '#3b2a1e', skin: '#e8b08a', vest: '#ff7a1a', pants: '#2d3a55' },
    { hair: '#d9b25a', skin: '#f0c4a0', vest: '#ff4f3a', pants: '#3a2d22' },
    { hair: '#1a1410', skin: '#9a6440', vest: '#ff9a1a', pants: '#24304a' },
    { hair: '#8a3a20', skin: '#f2c8a8', vest: '#ffb21a', pants: '#40404a' },
    { hair: '#bfbfbf', skin: '#d8a07a', vest: '#ff6a2a', pants: '#2a3a30' },
  ];
  S.surv = looks.map(L => [0, 1, 2].map(f => outline(mk(11, 14, (R, P) => {
    R(4, 1, 3, 3, L.skin); R(4, 1, 3, 1, L.hair); P(3, 2, L.hair); P(5, 2, '#20140c');
    R(3, 4, 5, 4, L.vest); R(3, 6, 5, 1, '#e8f4f4'); P(5, 4, shade(L.vest, 0.7));
    if (f === 0) { R(2, 4, 1, 3, L.skin); R(8, 4, 1, 3, L.skin); }
    else if (f === 1) { R(2, 1, 1, 3, L.skin); R(8, 1, 1, 3, L.skin); P(8, 0, '#7dff6a'); P(8, 1, '#7dff6a'); }
    else { R(1, 3, 2, 1, L.skin); R(8, 2, 1, 3, L.skin); }
    R(4, 8, 1, 4, L.pants); R(6, 8, 1, 4, L.pants); P(4, 12, '#222'); P(6, 12, '#222');
    if (f === 2) { R(4, 8, 1, 3, L.pants); R(6, 9, 1, 3, L.pants); }
  }))));
  S.survFlip = S.surv.map(a => a.map(flip));
  // ---- shark 34x15, 2 frames (mouth closed/open), facing right
  S.shark = [0, 1].map(f => {
    const c = mk(34, 15, (R, P) => {
      for (let x = 0; x < 30; x++) {
        const t = x / 29;
        const h = t < 0.14 ? 0.8 : Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.1) / 0.98)), 0.7) * 4.6;
        const cy = 8; const top = Math.round(cy - h), bot = Math.round(cy + h * 0.78);
        for (let y = top; y <= bot; y++) P(x + 2, y, y <= cy ? (y === top ? '#8ba0b3' : '#5d7184') : '#dfe5ea');
      }
      for (let k = 0; k < 5; k++) { P(2 - (k > 2 ? 1 : 0), 7 - k, '#5d7184'); P(1 + (k >> 1), 7 - k, '#5d7184'); P(2, 9 + k, '#5d7184'); P(1 + (k >> 1), 9 + k, '#5d7184'); }
      for (let k = 0; k < 5; k++) R(15 + k, 4 - Math.max(0, 3 - Math.abs(k - 1)), 1, Math.max(1, 3 - Math.abs(k - 1)) + 1, '#5d7184');
      R(18, 11, 3, 1, '#5d7184'); P(17, 12, '#5d7184');
      P(26, 6, '#0a0a0a'); P(27, 6, '#f0f0f0');
      R(21, 7, 1, 2, '#3d4e5e'); R(23, 7, 1, 2, '#3d4e5e');
      if (f === 1) { R(25, 9, 7, 2, '#3a0d12'); for (let x = 25; x < 32; x += 2) { P(x, 9, '#fff'); P(x + 1, 10, '#fff'); } }
      else R(26, 9, 5, 1, '#3d4e5e');
    });
    const o = outline(c); return [o, flip(o)];
  });
  // ---- jellyfish 11x15, 3 frames
  S.jelly = [0, 1, 2].map(f => outline(mk(11, 15, (R, P) => {
    const sq = [0, 1, 0][f];
    for (let y = 0; y < 5; y++) { const w = [3, 5, 7, 7, 7][y] + (y > 2 ? sq : 0); R(5 - (w >> 1), 1 + y, w, 1, y < 2 ? '#ffd4ef' : '#ff8fd0'); }
    P(4, 2, '#fff'); R(3, 5, 5, 1, '#d64fa0');
    for (let t = 0; t < 4; t++) for (let y = 0; y < 7; y++) P(3 + t + (Math.sin(y * 0.9 + f * 2 + t) > 0.3 ? 1 : 0) - (t > 1 ? 1 : 0), 6 + y, y % 2 ? '#ffb0e0' : '#e070b8');
  }), '#3a0a2a'));
  // ---- rescue bell 18x18
  S.bell = outline(mk(18, 18, (R, P) => {
    for (let y = 0; y < 15; y++) { const w = y < 2 ? 6 : y < 4 ? 10 : y < 6 ? 12 : 14; R(9 - (w >> 1), 1 + y, w, 1, y % 5 === 0 ? '#ffd27a' : '#f0a62a'); }
    R(5, 6, 4, 4, '#1b3550'); R(6, 7, 2, 2, '#9fe6ff'); P(6, 7, '#fff');
    R(10, 6, 4, 4, '#1b3550'); R(11, 7, 2, 2, '#9fe6ff');
    R(2, 15, 14, 2, '#7a4a12'); R(4, 13, 10, 2, '#0b1e30');
    P(8, 0, '#888'); P(9, 0, '#888');
  }));
  // ---- rescue boat 56x22 (stern left)
  S.boat = outline(mk(56, 22, (R, P) => {
    for (let y = 0; y < 8; y++) R(2 + Math.floor(y * y / 10), 12 + y, 52 - Math.floor(y * y / 10) - y * 2, 1, y < 2 ? '#f2f2ea' : y < 3 ? '#1f4fa0' : '#d8402c');
    R(8, 4, 20, 8, '#f2f2ea'); R(8, 4, 20, 1, '#c8c8c0'); for (let x = 10; x < 27; x += 4) R(x, 6, 3, 2, '#2a5a7a');
    R(14, 0, 8, 4, '#f2f2ea'); R(15, 1, 6, 2, '#2a5a7a'); R(17, -1, 1, 2, '#888');
    R(36, 2, 2, 10, '#e0a020'); R(36, 2, 18, 2, '#e0a020'); R(52, 4, 1, 2, '#555');
    for (let x = 4; x < 52; x += 6) P(x, 13, '#ff5a3a');
    R(30, 9, 4, 3, '#ff8a1a');
  }));
  // ---- crates
  S.crate = ['#9a6a3a', '#7a5a34', '#8a7040', '#6a4a2a'].map(c0 => outline(mk(10, 10, (R, P) => {
    R(1, 1, 8, 8, c0); R(1, 1, 8, 1, shade(c0, 1.25)); R(1, 4, 8, 1, shade(c0, 0.7)); R(1, 7, 8, 1, shade(c0, 0.7));
    for (let k = 0; k < 8; k++) P(1 + k, 1 + k, shade(c0, 0.8));
    P(1, 1, '#ccc'); P(8, 1, '#ccc'); P(1, 8, '#ccc'); P(8, 8, '#ccc');
  })));
  S.container = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d'].map(c0 => outline(mk(10, 10, (R, P) => {
    R(1, 1, 8, 8, c0); for (let x = 2; x < 9; x += 2) R(x, 2, 1, 6, shade(c0, 0.72)); R(1, 1, 8, 1, shade(c0, 1.3)); R(1, 8, 8, 1, shade(c0, 0.6));
  })));
  S.barrel = ['#3a6ab0', '#b0403a', '#3a8a5a', '#a0a03a'].map(c0 => outline(mk(10, 10, (R, P) => {
    R(2, 1, 6, 8, c0); R(1, 2, 8, 6, c0); R(1, 3, 8, 1, shade(c0, 0.6)); R(1, 6, 8, 1, shade(c0, 0.6)); R(3, 1, 1, 8, shade(c0, 1.35));
  })));
  S.beam = outline(mk(18, 6, (R, P) => { R(1, 1, 16, 4, '#6b6e74'); R(1, 1, 16, 1, '#a0a4aa'); R(1, 4, 16, 1, '#45484d'); for (let x = 3; x < 16; x += 4) P(x, 2, '#2a2c30'); }));
  // ---- HUD icons
  S.person = mk(5, 7, (R, P) => { R(1, 0, 3, 2, '#fff'); R(0, 2, 5, 3, '#fff'); R(1, 5, 1, 2, '#fff'); R(3, 5, 1, 2, '#fff'); });
  S.coin = outline(mk(7, 7, (R, P) => { R(1, 0, 3, 5, '#ffd84a'); R(0, 1, 5, 3, '#ffd84a'); R(2, 1, 1, 3, '#b8862b'); P(1, 1, '#fff6c0'); }), '#3a2a08');
  S.star = [false, true].map(on => outline(mk(9, 9, (R, P) => { const c = on ? '#ffd84a' : '#3a4a66'; R(3, 0, 1, 2, c); R(0, 2, 7, 2, c); R(1, 4, 5, 1, c); R(1, 5, 2, 1, c); R(4, 5, 2, 1, c); R(0, 6, 2, 1, c); R(5, 6, 2, 1, c); P(3, 1, on ? '#fff6c0' : c); }), '#05080f'));
}

// ---- ship tiles for a palette: returns { [tileType]: canvas[] variants }
export function buildTiles(pal, type) {
  const v = (k, fn) => Array.from({ length: k }, (_, s) => mk(8, 8, (R, P) => fn(R, P, s)));
  const noise = (P, base, s, amt = 0.08, seed = 1) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const h = hash(x, y, s * 31 + seed); if (h < 0.18) P(x, y, shade(base, 1 - amt)); else if (h > 0.9) P(x, y, shade(base, 1 + amt)); } };
  const hullT = (base) => v(4, (R, P, s) => {
    R(0, 0, 8, 8, base); noise(P, base, s, 0.07, 3);
    R(0, 0, 8, 1, shade(base, 1.12)); R(0, 7, 8, 1, shade(base, 0.82));
    if (s % 2 === 0) { P(1, 2, shade(base, 0.6)); P(6, 2, shade(base, 0.6)); P(1, 5, shade(base, 0.6)); P(6, 5, shade(base, 0.6)); }
    if (s === 3) { R(3, 3, 1, 5, mix(base, '#7a3a1a', 0.55)); P(4, 6, mix(base, '#7a3a1a', 0.5)); }
  });
  const t = {};
  t.hull = hullT(pal.hull); t.stripe = hullT(pal.stripe); t.bottom = hullT(pal.bottom);
  t.wall = v(3, (R, P, s) => {
    R(0, 0, 8, 8, pal.wall); noise(P, pal.wall, s, 0.08, 7);
    R(0, 0, 8, 1, shade(pal.wall, 1.3)); R(0, 7, 8, 1, shade(pal.wall, 0.6)); R(7, 0, 1, 8, shade(pal.wall, 0.75));
    if (s === 1) { P(2, 3, shade(pal.wall, 0.55)); P(5, 3, shade(pal.wall, 0.55)); }
  });
  const back = pal.back;
  t.back = v(10, (R, P, s) => {
    R(0, 0, 8, 8, back); noise(P, back, s, 0.06, 11);
    R(0, 0, 8, 1, shade(back, 0.8)); R(0, 0, 1, 8, shade(back, 0.85));
    if (s === 1) R(0, 3, 8, 1, shade(back, 1.45)), R(0, 4, 8, 1, shade(back, 0.7));
    if (s === 2) { R(2, 2, 4, 4, '#0d2a40'); R(3, 1, 2, 6, '#0d2a40'); R(1, 3, 6, 2, '#0d2a40'); P(3, 3, '#3a7a9a'); P(2, 2, shade(back, 1.6)); }
    if (s === 3) { R(2, 1, 4, 6, shade(back, 1.25)); R(2, 1, 4, 1, shade(back, 1.5)); P(5, 4, pal.trim); }
    if (s === 4) { R(1, 2, 3, 2, '#e8e0c0'); R(1, 2, 3, 1, '#ff5a3a'); }
    if (s === 5) { R(5, 0, 1, 8, shade(back, 1.4)); P(5, 4, pal.trim); }
  });
  t.hatch = v(1, (R, P) => {
    R(0, 0, 8, 8, shade(pal.wall, 0.9)); R(1, 1, 6, 6, '#3a3f45'); R(2, 1, 4, 6, '#5a6068'); R(1, 2, 6, 4, '#5a6068');
    R(2, 3, 4, 2, pal.trim); R(3, 2, 2, 4, pal.trim); P(3, 3, '#3a2a10'); P(4, 4, '#3a2a10');
  });
  t.hopen = v(1, (R, P) => { R(0, 0, 8, 8, shade(back, 0.7)); R(0, 0, 8, 1, '#22262a'); R(0, 7, 8, 1, '#22262a'); P(0, 1, pal.trim); P(7, 6, pal.trim); });
  t.debris = v(3, (R, P, s) => {
    const wood = type === 'sub' || type === 'rig' ? '#6a6d72' : '#7a5636';
    R(0, 0, 8, 8, shade(back, 0.6));
    for (let k = 0; k < 8; k++) { P(k, (k + s * 2) % 8, wood); P(k, (k + s * 2 + 1) % 8, shade(wood, 1.25)); P(7 - k, (k + 3) % 8, shade(wood, 0.8)); P(7 - k, (k + 4) % 8, wood); }
    R(0, 3 + (s % 2), 8, 2, shade(wood, 0.9)); R(0, 3 + (s % 2), 8, 1, shade(wood, 1.3));
    P(2, 4, '#c0c0c0'); P(6, 3, '#c0c0c0');
  });
  t.win = v(1, (R, P) => { R(0, 0, 8, 8, pal.hull); R(2, 1, 4, 6, '#2a3238'); R(1, 2, 6, 4, '#2a3238'); R(2, 2, 4, 4, '#3a8ab0'); P(2, 2, '#bff0ff'); P(3, 2, '#7ad0f0'); });
  t.breach = v(2, (R, P, s) => { for (let k = 0; k < 8; k++) if (hash(k, s, 5) < 0.5) P(k, hash(k, s, 9) < 0.5 ? 0 : 7, shade(pal.hull, 0.7)); });
  return t;
}
