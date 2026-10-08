// main.js - boots Inkvale: canvas sizing, the screen stack, input, the loop.

import { loadSave, writeSave } from './save.js';
import { LEVELS } from './data/levels.js';
import { Battle } from './battle.js';
import { Title, Story, WorldMap, Atelier, Heroes, Ency, Lobby, ACT_INTROS, ENDING } from './screens.js';
import { grainTile, paperTile, makeCanvas } from './paint.js';
import { PaintFilter } from './filter.js';
import { initAudio, setSfx, setMusic, sfx } from './audio.js';
import { text } from './ui.js';

// Three layers: the battlefield is drawn into an offscreen canvas, painted by
// the GPU filter onto #screen, and the HUD/menus go on a clear canvas on top
// so text stays sharp. Without WebGL2 the battlefield is copied over plainly.
const screenCanvas = document.getElementById('screen');
const canvas = document.createElement('canvas');      // UI layer (receives input)
canvas.id = 'ui';
document.body.appendChild(canvas);
const g = canvas.getContext('2d');
const world = makeCanvas(VW_INIT(), 1);
const wg = world.getContext('2d');
let filter = null, plain = null;
try { filter = new PaintFilter(screenCanvas); filter.setPaper(paperTile(512, 4)); }
catch (e) { console.warn('painting filter off:', e.message); plain = screenCanvas.getContext('2d'); }
function VW_INIT() { return 1280; }
const VW = 1280, VH = 720;

const app = {
  save: loadSave(),
  levels: LEVELS,
  screen: null,
  S: 1, ox: 0, oy: 0,
  mapScale: 2, artScale: 2, quality: 1.5, wq: 1,
  togglePaint() { this.save.paint = !(this.save.paint ?? true); writeSave(this.save); },
  go(name, o = {}) {
    if (name === 'battle') {
      // painting a map takes a moment: show a card first, then build
      this.loading = { label: 'Painting the battlefield...', t: 0 };
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.screen = new Battle(this, o.level, o);
        this.loading = null;
      }));
      return;
    }
    const map = { title: Title, story: Story, worldmap: WorldMap, atelier: Atelier, heroes: Heroes, ency: Ency, lobby: Lobby };
    this.screen = new map[name](this, o);
  },
  afterVictory(levelId, first) {
    const s = this.save;
    const actStory = { 4: 2, 8: 3 }[levelId];
    if (levelId === 12 && !s.story.ending) {
      this.go('story', { panels: ENDING, then: () => { s.story.ending = 1; writeSave(s); this.go('worldmap'); } });
      return;
    }
    if (actStory && !s.story['act' + actStory]) {
      this.go('story', { panels: ACT_INTROS[actStory], then: () => { s.story['act' + actStory] = 1; writeSave(s); this.go('worldmap'); } });
      return;
    }
    this.go('worldmap');
  },
  toggleSfx() { this.save.sfx = !this.save.sfx; setSfx(this.save.sfx); writeSave(this.save); },
  toggleMusic() { this.save.music = !this.save.music; setMusic(this.save.music); writeSave(this.save); },
};
window.inkvale = app; // handy for tests

setSfx(app.save.sfx);
setMusic(app.save.music);

let grain = null;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  screenCanvas.width = canvas.width; screenCanvas.height = canvas.height;
  screenCanvas.style.width = innerWidth + 'px'; screenCanvas.style.height = innerHeight + 'px';
  app.S = Math.min(canvas.width / VW, canvas.height / VH);
  app.ox = (canvas.width - VW * app.S) / 2;
  app.oy = (canvas.height - VH * app.S) / 2;
  // paint resolution: enough for this screen, capped so it stays quick
  const want = Math.min(2.5, Math.max(1, Math.ceil(app.S * 4) / 4));
  if (want > app.mapScale + 0.24 || !app.sized) { app.mapScale = want; app.artScale = want; }
  app.sized = true;
  sizeWorld();
}
// the battlefield's working resolution: the filter's cost grows with it
function sizeWorld() {
  const q = Math.max(0.7, Math.min(app.S, app.quality));
  const w = Math.round(VW * q), h = Math.round(VH * q);
  if (world.width !== w || world.height !== h) { world.width = w; world.height = h; }
  app.wq = q;
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ input
function toView(e) {
  const r = canvas.getBoundingClientRect();
  const dpr = canvas.width / r.width;
  return { x: ((e.clientX - r.left) * dpr - app.ox) / app.S, y: ((e.clientY - r.top) * dpr - app.oy) / app.S };
}
canvas.addEventListener('pointerdown', e => {
  initAudio();
  const p = toView(e);
  app.screen?.pointerMove?.(p.x, p.y);
  app.screen?.pointerDown?.(p.x, p.y, e);
});
canvas.addEventListener('pointermove', e => { const p = toView(e); app.screen?.pointerMove?.(p.x, p.y); });
// the drawn spells finish when the pointer comes up - anywhere, so a stroke
// that ends off the canvas still lands
addEventListener('pointerup', e => { const p = toView(e); app.screen?.pointerUp?.(p.x, p.y, e); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  initAudio();
  if (e.key === ' ') e.preventDefault();
  app.screen?.key?.(e.key);
});
// (not in a shared battle: one player tabbing away must not stop the other)
addEventListener('blur', () => { if (app.screen instanceof Battle && app.screen.state === 'play' && !app.screen.coop) app.screen.state = 'paused'; });

// ------------------------------------------------------------------ loop
let last = performance.now();
const perf = [];
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  // 1. the painted layer
  wg.setTransform(app.wq, 0, 0, app.wq, 0, 0);
  wg.fillStyle = '#efe2c4'; wg.fillRect(0, 0, VW, VH);
  if (!app.loading && app.screen) {
    app.screen.update(dt);
    app.screen.drawWorld?.(wg);
  }
  const view = [Math.round(app.ox), Math.round(app.oy), Math.round(VW * app.S), Math.round(VH * app.S)];
  if (filter) { filter.radius = 2.4 * app.wq; filter.render(world, view, !(app.save.paint ?? true)); }
  else { plain.setTransform(1, 0, 0, 1, 0, 0); plain.fillStyle = '#2b2320'; plain.fillRect(0, 0, screenCanvas.width, screenCanvas.height); plain.drawImage(world, ...view); }
  // 2. the crisp layer
  g.setTransform(app.S, 0, 0, app.S, app.ox, app.oy);
  g.save();
  g.beginPath(); g.rect(0, 0, VW, VH); g.clip();
  if (app.loading) {
    g.fillStyle = '#efe2c4'; g.fillRect(0, 0, VW, VH);
    text(g, app.loading.label, VW / 2, VH / 2, { size: 34, align: 'center', title: true });
  } else if (app.screen) app.screen.draw(g);
  g.restore();
  // 3. keep it smooth: if frames run long, paint at a lower resolution
  perf.push(dt);
  if (perf.length > 90) {
    const avg = perf.reduce((a, b) => a + b, 0) / perf.length;
    perf.length = 0;
    if (avg > 1 / 40 && app.quality > 0.75) { app.quality = Math.max(0.75, Math.min(app.S, app.quality) - 0.2); sizeWorld(); }
    else if (avg < 1 / 58 && app.quality < 1.5 && app.quality < app.S) { app.quality = Math.min(1.5, app.quality + 0.1); sizeWorld(); }
  }
  requestAnimationFrame(frame);
}

// fonts first so the first frame isn't in a fallback face
Promise.race([
  Promise.all([document.fonts.load("40px 'Fell'"), document.fonts.load("20px 'Hand'")]),
  new Promise(r => setTimeout(r, 2500)),
]).then(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('level')) app.go('battle', { level: +q.get('level') });
  else if (q.get('screen')) app.go(q.get('screen'));
  else app.go('title');
  requestAnimationFrame(frame);
});
