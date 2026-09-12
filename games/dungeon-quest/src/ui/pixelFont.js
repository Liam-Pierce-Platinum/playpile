// A real 5x7 bitmap font, drawn to canvas.
//
// System fonts anti-alias, which is exactly what a pixel UI must not do. This
// renders labels from a hand-built glyph table so every edge lands on a whole
// pixel, at any scale.

const G = {
  'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
  'B': '####./#...#/#...#/####./#...#/#...#/####.',
  'C': '.###./#...#/#..../#..../#..../#...#/.###.',
  'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
  'E': '#####/#..../#..../####./#..../#..../#####',
  'F': '#####/#..../#..../####./#..../#..../#....',
  'G': '.###./#...#/#..../#.###/#...#/#...#/.###.',
  'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  'I': '.###./..#../..#../..#../..#../..#../.###.',
  'J': '..###/...#./...#./...#./...#./#..#./.##..',
  'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  'L': '#..../#..../#..../#..../#..../#..../#####',
  'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  'N': '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  'P': '####./#...#/#...#/####./#..../#..../#....',
  'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  'R': '####./#...#/#...#/####./#.#../#..#./#...#',
  'S': '.####/#..../#..../.###./....#/....#/####.',
  'T': '#####/..#../..#../..#../..#../..#../..#..',
  'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
  'Z': '#####/....#/...#./..#../.#.../#..../#####',

  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '####./....#/....#/.###./....#/....#/####.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',

  ' ': '...../...../...../...../...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  ':': '...../.##../.##../...../.##../.##../.....',
  '-': '...../...../...../#####/...../...../.....',
  '_': '...../...../...../...../...../...../#####',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '=': '...../...../#####/...../#####/...../.....',
  '/': '....#/...#./..#../..#../.#.../#..../#....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  "'": '..#../..#../...../...../...../...../.....',
  '(': '...#../..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '%': '#...#/#..#./...#./..#../.#.../#..#./#...#',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '"': '.#.#./.#.#./...../...../...../...../.....',

  // arrow keys -- the action buttons need to be shown as arrows
  '↑': '...../..#../.###./#####/..#../..#../.....',
  '↓': '...../..#../..#../#####/.###./..#../.....',
  '←': '...../..#../.##../#####/.##../..#../.....',
  '→': '...../..#../..##./#####/..##./..#../.....',
  '♦': '..#../.###./#####/#####/#####/.###./..#..',
};

const GW = 5, GH = 7;
const MISSING = G['?'];

function glyph(ch) {
  return G[ch] || G[ch.toUpperCase()] || MISSING;
}

/** Width in pixels of `text` at the given scale. */
export function measure(text, scale = 3, tracking = 1) {
  if (!text.length) return 0;
  return text.length * (GW + tracking) * scale - tracking * scale;
}

/**
 * Render text into a fresh canvas.
 * @param opts { scale, color, shadow, shadowOffset, tracking, pad }
 */
export function renderText(text, opts = {}) {
  const {
    scale = 3,
    color = '#e8dfc8',
    shadow = null,
    shadowOffset = 1,
    tracking = 1,
    pad = 0,
  } = opts;

  const sx = shadow ? shadowOffset * scale : 0;
  const w = measure(text, scale, tracking) + sx + pad * 2;
  const h = GH * scale + sx + pad * 2;

  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;

  const draw = (col, ox, oy) => {
    x.fillStyle = col;
    let cx = pad + ox;
    for (const ch of text) {
      const rows = glyph(ch).split('/');
      for (let r = 0; r < GH; r++) {
        const row = rows[r] || '';
        for (let i = 0; i < GW; i++) {
          if (row[i] === '#') {
            x.fillRect(cx + i * scale, pad + oy + r * scale, scale, scale);
          }
        }
      }
      cx += (GW + tracking) * scale;
    }
  };

  if (shadow) draw(shadow, sx, sx);
  draw(color, 0, 0);
  return c;
}

/** Render into an existing element, replacing its contents. */
export function setPixelText(el, text, opts = {}) {
  const canvas = renderText(text, opts);
  el.innerHTML = '';
  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';
  el.appendChild(canvas);
  el.dataset.pxValue = text;
  return canvas;
}

/**
 * Convert every `[data-px]` element in a tree to pixel text. The attribute
 * value is the scale; `data-px-color` and `data-px-shadow` override colours.
 */
export function applyPixelText(root = document) {
  for (const el of root.querySelectorAll('[data-px]')) {
    const text = (el.dataset.pxText ?? el.textContent).trim();
    if (!text) continue;
    setPixelText(el, text, {
      scale: parseInt(el.dataset.px, 10) || 2,
      color: el.dataset.pxColor || '#e8dfc8',
      shadow: el.dataset.pxShadow || null,
      tracking: el.dataset.pxTracking ? parseInt(el.dataset.pxTracking, 10) : 1,
    });
  }
}

/** Multi-line block, centred. Returns a canvas. */
export function renderBlock(lines, opts = {}) {
  const { scale = 3, lineGap = 3 } = opts;
  const canvases = lines.map(l => renderText(l, opts));
  const w = Math.max(...canvases.map(c => c.width));
  const h = canvases.reduce((a, c) => a + c.height, 0) + lineGap * scale * (lines.length - 1);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  let y = 0;
  for (const cv of canvases) {
    x.drawImage(cv, Math.floor((w - cv.width) / 2), y);
    y += cv.height + lineGap * scale;
  }
  return c;
}
