// One palette, inherited from Grind City so the two games live in the same
// world: warm, saturated, plum-black outlines (never pure black), and every
// material a 3-4 step ramp.
export const P = {
  ink: '#241b2b', ink2: '#3a2c44', ink3: '#54415f',
  white: '#fff8ea', cream: '#f4e3c6',
  met1: '#e6eef2', met2: '#aebac2', met3: '#78868f', met4: '#4c5760',
  wood1: '#e0a765', wood2: '#b87c42', wood3: '#8a5729', wood4: '#5c3919',
  brk1: '#c96a4c', brk2: '#a04a35', brk3: '#743226', brk4: '#4d211a',
  rope1: '#fff2f0', rope2: '#d8c8c8', ropeR: '#ff4a3d', ropeB: '#3d8bff',
  ui1: '#ffcf70', ui2: '#ff8a3d', ui3: '#7fd4e8', ui4: '#f4e3c6',
  bad: '#ff5b5b', good: '#9ce85b', hot: '#ffd23d',
  hp1: '#9ce85b', hp2: '#5fae36', hpRec: '#f2f2d0', hpLost: '#ff5b5b',
  st1: '#ffd23d', st2: '#d19a1a',
  spark1: '#fffbe0', spark2: '#ffe066', spark3: '#ff9b3d',
};

// mix two #rrggbb colours, t=0 gives a, t=1 gives b
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export const shade = (c, t) => mix(c, '#1a1020', t);
export const light = (c, t) => mix(c, '#fff8ea', t);
