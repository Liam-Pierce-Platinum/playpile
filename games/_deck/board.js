// =====================================================================
// PLAYPILE :: games/_deck/board.js - THE LEADERBOARD
// =====================================================================
//
// Liam: *"add in home screens and leader boards to them all"*.
//
// There is no server behind this site, so a leaderboard here is a LOCAL
// one: ten rows in localStorage, per game, on this machine. That is worth
// saying plainly rather than pretending otherwise - but it is also the
// kind that actually gets played against, because the person who beat
// your 4,200 last night is you, and you can have another go now.
//
// Everything a board needs to differ per game is a parameter:
//   lower   - SWEEP's board is a time, and a small time is a good one.
//   format  - how a value is written: '4,200', '38 slabs', '01:12.4'.
//   unit    - the column heading.
//
// A run that gets into the top ten asks for three initials, which is the
// only part of an arcade leaderboard that people actually remember. The
// name is kept, so the second time you only have to press ENTER.
const KEY = 'pd.board.';
const NAME = 'pd.name';
const MAX = 10;

export class Board {
  /**
   * @param {string} key    the game's slug
   * @param {object} [o]
   * @param {boolean} [o.lower]   true if a SMALLER value is better
   * @param {function} [o.format] value -> string
   * @param {string} [o.unit]     column heading, e.g. 'SCORE' or 'TIME'
   */
  constructor(key, o = {}) {
    this.key = key;
    this.lower = !!o.lower;
    this.unit = o.unit || 'SCORE';
    this.format = o.format || ((v) => Math.round(v).toLocaleString());
  }

  get rows() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY + this.key) || '[]');
      return Array.isArray(raw) ? raw.slice(0, MAX) : [];
    } catch (e) { return []; }
  }
  set rows(v) { try { localStorage.setItem(KEY + this.key, JSON.stringify(v.slice(0, MAX))); } catch (e) {} }

  get best() { const r = this.rows[0]; return r ? r.score : (this.lower ? Infinity : 0); }

  /** would this run get on the board? */
  qualifies(score) {
    if (!isFinite(score)) return false;
    const r = this.rows;
    if (r.length < MAX) return true;
    return this.lower ? score < r[r.length - 1].score : score > r[r.length - 1].score;
  }

  /** put it on, and say which row it landed in (1-based, 0 if it missed) */
  submit(score, name, meta) {
    if (!this.qualifies(score)) return 0;
    const rows = this.rows;
    rows.push({ score, name: (name || 'YOU').slice(0, 3).toUpperCase(),
                when: Date.now(), meta: meta || null });
    rows.sort((a, b) => this.lower ? a.score - b.score : b.score - a.score);
    this.rows = rows;
    return rows.findIndex((r) => r.score === score && r.when) + 1;
  }

  clear() { this.rows = []; }
}

export const playerName = () => {
  try { return (localStorage.getItem(NAME) || 'YOU').toUpperCase(); } catch (e) { return 'YOU'; }
};
export const setPlayerName = (n) => {
  try { localStorage.setItem(NAME, (n || 'YOU').slice(0, 3).toUpperCase()); } catch (e) {}
};

/**
 * Draw a board.
 *
 * Takes the game's cabinet (either kind - they both have `g`, `text` and
 * a size), so a 2D game and a 3D one draw the identical panel.
 */
export function drawBoard(D, board, x, y, w, opts = {}) {
  const g = D.g;
  const rows = board.rows;
  const n = opts.rows || 8;
  const lh = opts.lh || 20;
  const h = 34 + n * lh;

  g.fillStyle = opts.bg || 'rgba(8,12,18,.55)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = opts.edge || 'rgba(255,255,255,.10)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  D.text(opts.title || 'BEST RUNS', x + 12, y + 21, 11, opts.head || '#8b96a8');
  D.text(board.unit, x + w - 12, y + 21, 11, opts.head || '#8b96a8', 'right');

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const ty = y + 40 + i * lh;
    const hot = opts.highlight !== undefined && opts.highlight === i + 1;
    if (hot) {
      g.fillStyle = 'rgba(255,159,67,.16)';
      g.fillRect(x + 6, ty - 13, w - 12, lh - 2);
    }
    D.text(String(i + 1).padStart(2, ' '), x + 12, ty, 12, hot ? '#ffd166' : '#5a6577');
    if (!r) { D.text('—', x + 46, ty, 12, '#33404f'); continue; }
    D.text(r.name || 'YOU', x + 46, ty, 12, hot ? '#ffe9a8' : '#cbd6e4');
    D.text(board.format(r.score), x + w - 12, ty, 12, hot ? '#ffd166' : '#e7ecf3', 'right');
    if (opts.dates !== false && r.when) {
      const d = new Date(r.when);
      D.text((d.getMonth() + 1) + '/' + d.getDate(), x + 110, ty, 10, '#4a5666');
    }
  }
  return h;
}

/** mm:ss.t, for the boards that keep a time */
export const asTime = (s) => {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
};
