// A deliberately small, muted palette. N64 games lived in 16-bit colour and
// leaned on desaturated hues so the dithering had somewhere to hide.
export const CLOTH = [
  '#7a2b2b', '#8c4a1f', '#b08a2e', '#3f6b3a',
  '#2f5d78', '#3c3a75', '#6b3168', '#4a4a52',
  '#8f8574', '#23222c', '#8a93a0', '#6e7b8b',
];

export const ACCENT = [
  '#d9c98a', '#c8712f', '#e0e0d2', '#6f8f5a',
  '#5fa0c0', '#8a7fd0', '#c06a9e', '#2b2a33',
  '#5e4632', '#a33b3b',
];

export const TRIM = [
  '#d4af37', '#c0c4cc', '#8c6a3f', '#6e7b8b',
  '#3d3a2e', '#b5651d', '#7d8f9a', '#e8dfc8',
];

export const SKIN = ['#e0ac7e', '#c68642', '#8d5524', '#5c3a21', '#f0c8a0'];

export const HAIR = ['#2b1d14', '#5a3a1b', '#8b6a3a', '#c9b075', '#a33b1f', '#d8d3c4'];

/** Named colours used by enemies and props. */
export const NAMED = {
  bone:      '#ded3b4',
  boneDark:  '#a89772',
  slimeBlue: '#3d7fd6',
  zombieFlesh: '#6f8a5a',
  zombieRag: '#4a4638',
  steel:     '#9aa3ad',
  darkSteel: '#5a6068',
  wood:      '#6b4a2c',
  gold:      '#d4af37',
  forestGround: '#3f4a2a',
  forestAccent: '#5d6b39',
};

export function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }
export function randOf(arr) { return arr[(Math.random() * arr.length) | 0]; }
