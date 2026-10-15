// 3x5 bitmap font. Every glyph is 5 rows of 3 bits. All text in the game is drawn with this.
const RAW = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
  '*': '000101010101000', '%': '101001010100101', "'": '010010000000000', '(': '010100100100010',
  ')': '010001001001010', '<': '001010100010001', '>': '100010001010100', '#': '101111101111101',
  '=': '000111000111000', '_': '000000000000111', '^': '010101000000000',
};
const GL = {};
for (const k in RAW) GL[k] = [...RAW[k]].map((c) => c === '1');

export function textWidth(s, sc = 1) { return s.length ? (s.length * 4 - 1) * sc : 0; }

// Draws text at integer pixels. opts: { sc, shadow, align:'left'|'center'|'right' }
export function text(ctx, s, x, y, color, opts = {}) {
  s = String(s).toUpperCase();
  const sc = opts.sc || 1;
  if (opts.align === 'center') x -= textWidth(s, sc) / 2;
  else if (opts.align === 'right') x -= textWidth(s, sc);
  x = Math.round(x); y = Math.round(y);
  if (opts.shadow !== false) {
    ctx.fillStyle = opts.shadow || '#0b0716';
    draw(ctx, s, x + sc, y + sc, sc);
    if (opts.outline) { draw(ctx, s, x - sc, y, sc); draw(ctx, s, x + sc, y, sc); draw(ctx, s, x, y - sc, sc); draw(ctx, s, x, y + sc, sc); }
  }
  if (Array.isArray(color)) { // vertical gradient by row
    for (let r = 0; r < 5; r++) { ctx.fillStyle = color[Math.min(color.length - 1, r)]; draw(ctx, s, x, y, sc, r); }
  } else { ctx.fillStyle = color; draw(ctx, s, x, y, sc); }
}

function draw(ctx, s, x, y, sc, onlyRow = -1) {
  for (let i = 0; i < s.length; i++) {
    const g = GL[s[i]]; if (!g) continue;
    const ox = x + i * 4 * sc;
    for (let r = 0; r < 5; r++) {
      if (onlyRow >= 0 && r !== onlyRow) continue;
      for (let c = 0; c < 3; c++) if (g[r * 3 + c]) ctx.fillRect(ox + c * sc, y + r * sc, sc, sc);
    }
  }
}
