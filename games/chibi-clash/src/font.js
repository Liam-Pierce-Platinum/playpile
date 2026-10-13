// Crisp pixel text on the game canvas: Press Start 2P rendered once per string+colour,
// alpha-thresholded so there is no anti-aliased fringe, then cached.
const cache = new Map();
let ready = false;
export async function loadFont() {
  try { await document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* fall back to monospace */ }
  ready = true; cache.clear();
}
function glyphs(str, col, size) {
  const key = size + '|' + col + '|' + str;
  let c = cache.get(key);
  if (c) return c;
  const cv = document.createElement('canvas');
  const x = cv.getContext('2d');
  const font = `${size}px "Press Start 2P", monospace`;
  x.font = font;
  cv.width = Math.max(1, Math.ceil(x.measureText(str).width) + 2); cv.height = size + 3;
  x.font = font; x.textBaseline = 'top'; x.fillStyle = col; x.fillText(str, 0, 1);
  const img = x.getImageData(0, 0, cv.width, cv.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  x.putImageData(img, 0, 0);
  if (cache.size > 600) cache.clear();
  cache.set(key, cv);
  return cv;
}
export function textW(str, size = 8) { return glyphs(str, '#fff', size).width - 2; }
// align: 'l' | 'c' | 'r'; outline draws a 1px dark border all round (readable over anything)
export function text(ctx, str, x, y, col = '#ffffff', align = 'l', size = 8, outline = '#1e1426') {
  str = String(str);
  const g = glyphs(str, col, size);
  let dx = Math.round(x); if (align === 'c') dx -= Math.round((g.width - 2) / 2); if (align === 'r') dx -= g.width - 2;
  const dy = Math.round(y);
  if (outline) {
    const o = glyphs(str, outline, size);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.drawImage(o, dx + ox, dy + oy);
  }
  ctx.drawImage(g, dx, dy);
}
