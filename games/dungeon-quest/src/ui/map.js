// THE BOUGHT MAP.
//
// A top-down chart of the level, drawn to a canvas in the same chunky pixel
// idiom as the rest of the UI: no anti-aliasing, no curves, everything on a
// whole-pixel grid. It is bought once per level from that level's merchant,
// and it is the only thing that makes the mine's dead ends navigable.
import { renderText } from './pixelFont.js';

const INK = {
  ground: '#3a3242',
  floor: '#6b5f4a',
  floorLit: '#8a7a5c',
  wall: '#221d29',
  arena: '#7a2f24',
  shrine: '#f2c14e',
  tavern: '#c07a3c',
  shop: '#3f8ab0',
  chest: '#d4af37',
  you: '#e8f0ff',
  frame: '#8d7f9e',
};

export class LevelMap {
  constructor() {
    this.el = document.getElementById('map-screen');
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.titleEl = document.getElementById('map-title');
    this.open = false;
  }

  show(level, world, player) {
    this.titleEl.innerHTML = '';
    const t = renderText(level.name, { scale: 2, color: '#f2c14e', shadow: '#000' });
    t.style.imageRendering = 'pixelated';
    this.titleEl.appendChild(t);
    this.draw(world, player);
    this.el.hidden = false;
    this.open = true;
  }

  hide() { this.el.hidden = true; this.open = false; }

  /** Redraw only the player pip's position -- called while the map is up. */
  refresh(world, player) { if (this.open) this.draw(world, player); }

  draw(world, player) {
    const d = world.mapData;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    c.imageSmoothingEnabled = false;
    c.fillStyle = INK.ground;
    c.fillRect(0, 0, W, H);
    if (!d) return;

    // world bounds -> canvas, keeping the aspect square so nothing is stretched
    const b = this.bounds(d);
    const pad = 10;
    const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * sc) / 2 - b.minX * sc;
    const oz = (H - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc;
    const X = x => Math.round(x * sc + ox);
    const Z = z => Math.round(z * sc + oz);
    const R = n => Math.max(1, Math.round(n * sc));

    if (d.kind === 'grid') this.drawGrid(c, d, X, Z, R);
    else this.drawValley(c, d, X, Z, R);

    // the dragon's chamber, marked but not named
    if (d.arena) {
      c.fillStyle = INK.arena;
      const r = R(d.arena.r);
      c.fillRect(X(d.arena.x) - r, Z(d.arena.z) - r, r * 2, r * 2);
    }

    this.pips(c, world, X, Z);

    // you
    c.fillStyle = INK.you;
    const px = X(player.position.x), pz = Z(player.position.z);
    c.fillRect(px - 2, pz - 2, 5, 5);
    c.fillStyle = '#1a1520';
    c.fillRect(px - 1, pz - 1, 3, 3);
    c.fillStyle = INK.you;
    c.fillRect(px, pz, 1, 1);

    c.strokeStyle = INK.frame;
    c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }

  bounds(d) {
    if (d.kind === 'grid') {
      const half = (d.cols * d.cell) / 2 + d.room;
      return {
        minX: -half, maxX: half,
        minZ: -30, maxZ: (d.rows - 1) * d.cell + 26 + d.arena.r + 8,
      };
    }
    return { minX: -d.halfWidth * 1.6, maxX: d.halfWidth * 1.6, minZ: d.zStart, maxZ: d.zEnd };
  }

  drawGrid(c, d, X, Z, R) {
    const open = (col, row) =>
      row >= 0 && row < d.rows && col >= 0 && col < d.cols && d.grid[row][col] === 1;
    const half = R(d.room);
    const hall = R(3.6);
    for (let r = 0; r < d.rows; r++) {
      for (let col = 0; col < d.cols; col++) {
        if (!open(col, r)) continue;
        const p = d.cellPos(col, r);
        c.fillStyle = INK.floor;
        c.fillRect(X(p.x) - half, Z(p.z) - half, half * 2, half * 2);
        if (open(col + 1, r)) {
          const q = d.cellPos(col + 1, r);
          c.fillRect(X(p.x), Z(p.z) - hall, X(q.x) - X(p.x), hall * 2);
        }
        if (open(col, r + 1)) {
          const q = d.cellPos(col, r + 1);
          c.fillRect(X(p.x) - hall, Z(p.z), hall * 2, Z(q.z) - Z(p.z));
        }
      }
    }
    // the shaft down from the pit head
    const first = d.cellPos(1, 0);
    c.fillStyle = INK.floor;
    c.fillRect(X(first.x) - hall, Z(-22), hall * 2, Z(first.z) - Z(-22));
    // and the approach to the hall
    c.fillRect(X(d.arena.x) - hall, Z((d.rows - 1) * d.cell), hall * 2,
      Z(d.arena.z - d.arena.r) - Z((d.rows - 1) * d.cell));
  }

  drawValley(c, d, X, Z, R) {
    const step = 4;
    c.fillStyle = INK.floor;
    for (let z = d.zStart; z <= d.zEnd; z += step) {
      const x = d.centre(z);
      const w = R(d.halfWidth);
      c.fillRect(X(x) - w, Z(z), w * 2, Math.max(1, Z(z + step) - Z(z)));
    }
    // the road itself, lighter
    c.fillStyle = INK.floorLit;
    for (let z = d.zStart; z <= d.zEnd; z += step) {
      const x = d.centre(z);
      const w = R(4.5);
      c.fillRect(X(x) - w, Z(z), w * 2, Math.max(1, Z(z + step) - Z(z)));
    }
  }

  pips(c, world, X, Z) {
    const dot = (x, z, color, size = 3) => {
      c.fillStyle = color;
      c.fillRect(X(x) - size, Z(z) - size, size * 2 + 1, size * 2 + 1);
    };
    for (const s of world.shops || []) dot(s.x, s.z, INK.shop);
    for (const t of world.taverns || []) dot(t.x, t.z, INK.tavern);
    for (const ch of world.chests || []) {
      if (ch.opened) continue;
      dot(ch.position ? ch.position.x : ch.x, ch.position ? ch.position.z : ch.z, INK.chest, 2);
    }
    // shrines last so they sit on top, and lit ones read brighter
    for (const cp of world.checkpoints || []) {
      c.fillStyle = cp.claimed ? INK.shrine : '#7a6a3c';
      c.fillRect(X(cp.x) - 3, Z(cp.z) - 3, 7, 7);
      c.fillStyle = '#1a1520';
      c.fillRect(X(cp.x) - 1, Z(cp.z) - 1, 3, 3);
    }
  }
}
