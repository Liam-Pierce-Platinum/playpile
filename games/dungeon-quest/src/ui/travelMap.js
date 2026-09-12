// THE TRAVEL INTERLUDE.
//
// Between chapters the hero has to actually GET to the next place. This draws
// the kingdom as a pixel chart and walks a marker along the road from the
// place you just cleared to the place you are going, with the trail inking in
// behind it. It is the only screen that shows the whole campaign at once.
import { renderText } from './pixelFont.js';

/** The kingdom, in map coordinates (0-1 across the chart). */
const PLACES = [
  { id: 'forest', name: 'THE FOREST BETWEEN THE CLIFFS', x: 0.20, y: 0.74, kind: 'forest' },
  { id: 'mine', name: 'THE MINE SHAFT', x: 0.47, y: 0.55, kind: 'mine' },
  { id: 'mountain', name: 'THE FROZEN MOUNTAIN', x: 0.72, y: 0.30, kind: 'ice' },
  { id: 'cliff', name: 'THE BLACK CLIFF', x: 0.86, y: 0.70, kind: 'cave' },
];

const INK = {
  sea: '#1b2230',
  land: '#4a4634',
  landLit: '#5a5540',
  coast: '#2b3242',
  road: '#7a6a4a',
  roadDone: '#c8a04a',
  place: '#8d7f9e',
  cleared: '#6a8a4a',
  next: '#ff6a4a',
  hero: '#e8f0ff',
  ink: '#12161e',
};

export class TravelMap {
  constructor() {
    this.el = document.getElementById('travel');
    this.canvas = document.getElementById('travel-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.capEl = document.getElementById('travel-caption');
    this.active = false;
    this.t = 0;
    this.dur = 4.2;
    this.from = 0;
    this.to = 1;
    this.onDone = null;

    // The keypress that skipped the outro is still being dispatched when this
    // screen opens, and window listeners all see the same event -- without a
    // guard the map appeared and vanished in the same frame.
    this.guard = 0;
    const skip = (e) => {
      if (!this.active || this.guard > 0) return;
      e.preventDefault();
      this.finish();
    };
    addEventListener('keydown', skip);
    this.el.addEventListener('click', skip);
  }

  /**
   * Walk from one level to the next.
   * @param fromId level id just finished, or null to start at the first place
   * @param toId   level id being travelled to
   */
  play(fromId, toId, onDone) {
    const from = PLACES.findIndex(p => p.id === fromId);
    const to = PLACES.findIndex(p => p.id === toId);
    if (to < 0) { onDone?.(); return; }
    this.from = from < 0 ? to : from;
    this.to = to;
    this.t = 0;
    this.guard = 0.45;
    this.active = true;
    this.onDone = onDone;
    this.caption(PLACES[this.to].name);
    this.el.hidden = false;
    this.draw(0);
  }

  caption(text) {
    this.capEl.innerHTML = '';
    const c = renderText(text, { scale: 2, color: '#f2c14e', shadow: '#000' });
    c.style.imageRendering = 'pixelated';
    this.capEl.appendChild(c);
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.el.hidden = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  update(dt) {
    if (!this.active) return;
    this.guard = Math.max(0, this.guard - dt);
    this.t += dt;
    // ease the walk, then hold a beat on arrival before handing over
    const k = Math.min(1, this.t / this.dur);
    this.draw(k * k * (3 - 2 * k));
    if (this.t >= this.dur + 1.1) this.finish();
  }

  /** @param k 0..1 how far along the road the hero is */
  draw(k) {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    c.imageSmoothingEnabled = false;
    c.fillStyle = INK.sea;
    c.fillRect(0, 0, W, H);

    const X = u => Math.round(u * W);
    const Y = v => Math.round(v * H);

    // the landmass: blocky, hand-placed, drawn as whole-pixel steps so it
    // reads as a chart and not as a shape somebody dragged out
    const land = [
      [0.06, 0.62, 0.34, 0.32], [0.14, 0.44, 0.30, 0.26],
      [0.30, 0.40, 0.28, 0.34], [0.40, 0.20, 0.26, 0.30],
      [0.56, 0.16, 0.28, 0.28], [0.62, 0.40, 0.30, 0.42],
      [0.24, 0.70, 0.44, 0.22],
    ];
    c.fillStyle = INK.coast;
    for (const [x, y, w, h] of land) {
      c.fillRect(X(x) - 3, Y(y) - 3, X(w) + 6, Y(h) + 6);
    }
    c.fillStyle = INK.land;
    for (const [x, y, w, h] of land) c.fillRect(X(x), Y(y), X(w), Y(h));

    // a little relief so it is not one flat slab
    c.fillStyle = INK.landLit;
    for (let i = 0; i < 90; i++) {
      const a = (i * 2654435761) >>> 0;
      const px = X(0.08 + ((a >>> 8) % 800) / 1000);
      const py = Y(0.20 + ((a >>> 18) % 700) / 1000);
      c.fillRect(px, py, 3, 2);
    }

    // the road: dotted, and it inks in solid behind the walker
    const a = PLACES[this.from], b = PLACES[this.to];
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y);
    const steps = 46;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = Math.round(ax + (bx - ax) * u);
      // bow the road so it is a journey and not a ruler line
      const bow = Math.sin(u * Math.PI) * -18;
      const py = Math.round(ay + (by - ay) * u + bow);
      c.fillStyle = u <= k ? INK.roadDone : INK.road;
      const s = u <= k ? 3 : 2;
      c.fillRect(px - (s >> 1), py - (s >> 1), s, s);
    }

    // the places
    for (const p of PLACES) {
      const px = X(p.x), py = Y(p.y);
      const done = PLACES.indexOf(p) < this.to;
      const isNext = p === b;
      c.fillStyle = INK.ink;
      c.fillRect(px - 5, py - 5, 11, 11);
      c.fillStyle = isNext ? INK.next : done ? INK.cleared : INK.place;
      c.fillRect(px - 4, py - 4, 9, 9);
      c.fillStyle = INK.ink;
      c.fillRect(px - 1, py - 1, 3, 3);
      this.icon(c, p.kind, px, py - 12, isNext ? INK.next : INK.place);
    }

    // the hero, walking
    const u = k;
    const hx = Math.round(ax + (bx - ax) * u);
    const hy = Math.round(ay + (by - ay) * u + Math.sin(u * Math.PI) * -18);
    const bob = Math.round(Math.sin(this.t * 9) * 1.5);
    c.fillStyle = INK.ink;
    c.fillRect(hx - 4, hy - 9 + bob, 9, 11);
    c.fillStyle = INK.hero;
    c.fillRect(hx - 3, hy - 8 + bob, 7, 9);
    c.fillStyle = INK.ink;
    c.fillRect(hx - 1, hy - 6 + bob, 3, 2);

    c.strokeStyle = '#8d7f9e';
    c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }

  /** Tiny 9x9 glyphs so each place reads at a glance. */
  icon(c, kind, x, y, color) {
    c.fillStyle = color;
    if (kind === 'forest') {
      c.fillRect(x - 1, y + 2, 3, 3);
      c.fillRect(x - 4, y - 1, 9, 3);
      c.fillRect(x - 3, y - 4, 7, 3);
    } else if (kind === 'mine') {
      c.fillRect(x - 5, y + 2, 11, 2);
      c.fillRect(x - 4, y - 3, 2, 5);
      c.fillRect(x + 3, y - 3, 2, 5);
      c.fillRect(x - 4, y - 4, 9, 2);
    } else if (kind === 'ice') {
      c.fillRect(x - 1, y - 5, 3, 10);
      c.fillRect(x - 5, y - 1, 11, 3);
      c.fillRect(x - 3, y - 4, 3, 3);
      c.fillRect(x + 2, y + 2, 3, 3);
    } else {
      c.fillRect(x - 5, y + 2, 11, 3);
      c.fillRect(x - 4, y - 1, 4, 4);
      c.fillRect(x + 2, y - 1, 4, 4);
      c.fillRect(x - 1, y - 4, 3, 7);
    }
  }
}
