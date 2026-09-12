// =====================================================================
// PLAYPILE :: games/_deck/home.js - THE FRONT OF EVERY CABINET
// =====================================================================
//
// Liam: *"add in home screens and leader boards to them all"*.
//
// One home screen, used by all ten games, so that going from one to the
// next feels like the same machine: the name, one line about what the
// game is, the buttons, and the ten best runs down the side. A game with
// its own options (SWEEP's size and difficulty, HOPPER's customisation)
// hands in a `panel` and draws its own into the space.
//
// It also owns the bit between the run and the board: when a run gets
// into the top ten it asks for THREE INITIALS, because that is the part
// of an arcade leaderboard anybody remembers. It remembers the last name
// used, so the second time is one press of ENTER.
//
// It draws with whatever cabinet it is given - the 2D `Deck` and the 3D
// `Deck3D` both have `g`, `text`, `W`, `H`, `mouse` and `tapped()`, and
// that is the whole surface this needs.
import { drawBoard, playerName, setPlayerName } from './board.js';

export class Home {
  /**
   * @param {object} D        the cabinet (Deck or Deck3D)
   * @param {object} o
   * @param {string} o.title
   * @param {string[]} o.lines      one or three lines about the game
   * @param {Board} o.board
   * @param {object[]} o.buttons    [{ label, sub, fn }]
   * @param {object} [o.panel]      { h, draw(D, x, y, w), click(D, x, y, w) }
   * @param {string} [o.hint]       a line of controls along the bottom
   */
  constructor(D, o) {
    this.D = D; this.o = o;
    this.mode = 'home';               // home | entry
    this.pending = null;              // { score, rank, meta }
    this.name = playerName();
    this.typed = '';
    this.hot = [];
    this.flash = 0;

    // WHERE THE BUTTONS ARE, FOR THE TOOLS.
    //
    // tools/smoke.mjs has to get past the home screen of eleven
    // different games, and it used to do it by clicking the middle of
    // the canvas and hoping. That works until a home screen puts
    // something else in the middle - DUNK's team sheet, for instance -
    // and then the smoke test spends its whole run on the menu and
    // reports the game as a blank screen, which is exactly what
    // happened. Every one of these games builds its menu out of this
    // class, so this is the one place that knows the answer.
    window.__home = this;

    // typing, for the initials
    addEventListener('keydown', (e) => {
      if (this.mode !== 'entry') return;
      if (e.key === 'Enter') { this.commit(); return; }
      if (e.key === 'Backspace') { this.typed = this.typed.slice(0, -1); return; }
      if (/^[a-zA-Z0-9]$/.test(e.key) && this.typed.length < 3) this.typed += e.key.toUpperCase();
    });
  }

  /** a run has ended - show the board, and ask for a name if it earned one */
  finish(score, meta) {
    const b = this.o.board;
    this.mode = 'home';
    this.lastScore = score;
    this.rank = 0;
    // A GAME MAY HAVE NOTHING TO SUBMIT. SWEEP's board is a time per
    // cleared level, written the moment the level is cleared, so when the
    // run ends there is no single number to put up - it just wants the
    // home screen back.
    if (score === undefined || score === null) return;
    if (b && b.qualifies(score)) {
      this.pending = { score, meta };
      this.typed = this.name === 'YOU' ? '' : this.name;
      this.mode = 'entry';
    }
  }

  commit() {
    if (!this.pending) { this.mode = 'home'; return; }
    const n = (this.typed || 'YOU').slice(0, 3);
    setPlayerName(n); this.name = n;
    this.rank = this.o.board.submit(this.pending.score, n, this.pending.meta);
    this.pending = null;
    this.mode = 'home';
    this.flash = 1;
    if (this.D.beep) this.D.beep(760, 0.16, 'triangle', 0.06, 320);
  }

  /** call every frame while the game is not being played */
  step(dt) {
    const D = this.D, g = D.g, o = this.o;
    this.flash = Math.max(0, this.flash - dt);
    this.hot = [];

    // a dark wash over whatever the game is drawing behind
    g.fillStyle = o.wash || 'rgba(6,9,13,.78)';
    g.fillRect(0, 0, D.W, D.H);

    const wide = D.W >= 620;
    const pad = 26;
    const boardW = wide ? Math.min(300, D.W * 0.38) : D.W - pad * 2;
    const leftW = wide ? D.W - boardW - pad * 3 : D.W - pad * 2;
    const x = pad;
    let y = Math.max(54, D.H * 0.10);

    D.text(o.title, x, y + 30, Math.min(42, leftW * 0.13), '#ff9f43');
    y += 46;
    // THE TEXT HAS TO FIT THE COLUMN, not the screen. The board sits in
    // the right-hand third, so a line measured against the full width
    // runs underneath it. Shrink until it fits, down to 10px.
    for (const line of (o.lines || [])) {
      let size = 12;
      while (size > 9) {
        g.font = '700 ' + size + 'px ui-monospace,Menlo,Consolas,monospace';
        if (g.measureText(line).width <= leftW) break;
        size--;
      }
      D.text(line, x, y + 14, size, '#9aa7b8');
      y += 19;
    }
    y += 10;

    if (this.mode === 'entry') { this.entry(x, y, leftW); return; }

    // buttons
    for (const b of (o.buttons || [])) {
      const w = Math.min(leftW, 260), h = b.sub ? 54 : 44;
      const over = D.mouse.x > x && D.mouse.x < x + w && D.mouse.y > y && D.mouse.y < y + h;
      g.fillStyle = over ? '#ffb15e' : 'rgba(255,159,67,.14)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = over ? '#ffd9a8' : 'rgba(255,159,67,.55)';
      g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      D.text(b.label, x + 16, y + (b.sub ? 24 : 28), 15, over ? '#2a1a10' : '#ffd9a8');
      if (b.sub) D.text(b.sub, x + 16, y + 42, 11, over ? '#6a4426' : '#a8865e');
      this.hot.push({ x, y, w, h, fn: b.fn });
      y += h + 10;
    }

    // a game's own options
    if (o.panel) {
      const used = o.panel.draw(D, x, y + 6, leftW) || o.panel.h || 0;
      if (o.panel.click) this.hot.push({ x, y: y + 6, w: leftW, h: used, fn: null, panel: true });
      y += used + 16;
    }

    if (o.hint) D.text(o.hint, x, D.H - 22, 11, '#5a6577');

    // the board
    if (o.board) {
      const bx = wide ? D.W - boardW - pad : x;
      const by = wide ? Math.max(54, D.H * 0.10) : y;
      drawBoard(D, o.board, bx, by, boardW, {
        rows: wide ? 10 : 5,
        highlight: this.flash > 0 ? this.rank : undefined,
      });
      // `!= null` on purpose: SWEEP finishes a run with NO score (its
      // board is a per-level time, written as each level falls), and
      // formatting a null is how that crashed the first time.
      if (this.lastScore != null) {
        D.text('last run  ' + o.board.format(this.lastScore), bx, by - 10, 11,
               this.rank ? '#ffd166' : '#8b96a8');
      }
    }

    // clicks
    if (D.tapped()) {
      const p = D.mouse;
      for (const h of this.hot) {
        if (p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h) {
          if (h.panel) { if (o.panel.click) o.panel.click(D, h.x, h.y, h.w); return; }
          if (h.fn) h.fn();
          return;
        }
      }
    }
  }

  /** three initials, the only part of a leaderboard anybody remembers */
  entry(x, y, w) {
    const D = this.D, g = D.g;
    D.text('THAT IS A TOP TEN RUN', x, y + 16, 16, '#ffd166');
    D.text(this.o.board.format(this.pending.score), x, y + 40, 22, '#e7ecf3');
    D.text('type three letters, then ENTER', x, y + 66, 11, '#8b96a8');

    const boxW = 54, gap = 10;
    for (let i = 0; i < 3; i++) {
      const bx = x + i * (boxW + gap), by = y + 80;
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(bx, by, boxW, 60);
      g.strokeStyle = i === this.typed.length ? '#ff9f43' : 'rgba(255,255,255,.18)';
      g.lineWidth = 2; g.strokeRect(bx + 1, by + 1, boxW - 2, 58);
      const ch = this.typed[i];
      if (ch) D.text(ch, bx + boxW / 2, by + 42, 30, '#ffe9a8', 'center');
      else if (i === this.typed.length && Math.floor(D.t * 2) % 2)
        D.text('_', bx + boxW / 2, by + 42, 30, '#ff9f43', 'center');
    }
    const bx = x, by = y + 156;
    const over = D.mouse.x > bx && D.mouse.x < bx + 180 && D.mouse.y > by && D.mouse.y < by + 40;
    g.fillStyle = over ? '#ffb15e' : 'rgba(255,159,67,.14)';
    g.fillRect(bx, by, 180, 40);
    g.strokeStyle = 'rgba(255,159,67,.55)'; g.lineWidth = 2;
    g.strokeRect(bx + 1, by + 1, 178, 38);
    D.text('PUT IT ON THE BOARD', bx + 90, by + 25, 11, over ? '#2a1a10' : '#ffd9a8', 'center');
    if (D.tapped() && over) this.commit();
  }
}
