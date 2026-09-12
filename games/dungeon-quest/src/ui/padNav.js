// D-PAD MENU NAVIGATION.
//
// Every full-screen panel in the game is ordinary HTML with ordinary buttons,
// which is exactly right for a mouse and useless with a controller. This walks
// whatever panel is currently open, keeps a cursor on one item, and draws a
// highlight on it -- because on a pad you cannot see where you are unless the
// game shows you.
//
// It reads the layout from the DOM every time it opens, so nothing has to be
// registered and new screens work without being told about.

const FOCUSABLE = 'button:not([disabled]):not([hidden]), .swatch-row i, [data-nav]';

export class PadNav {
  constructor() {
    this.root = null;
    this.items = [];
    this.index = 0;
    this.repeat = 0;
  }

  get open() { return !!this.root; }

  /** Take over a panel. Pass null to hand control back. */
  attach(root) {
    if (root === this.root) return;
    this.clear();
    this.root = root;
    if (!root) return;
    this.scan();
  }

  clear() {
    for (const el of this.items) el.classList.remove('nav-on');
    this.items = [];
    this.root = null;
    this.index = 0;
  }

  /** Re-read the panel. Lists rebuild themselves after every purchase. */
  scan() {
    if (!this.root) return;
    const was = this.items[this.index];
    for (const el of this.items) el.classList.remove('nav-on');
    this.items = [...this.root.querySelectorAll(FOCUSABLE)]
      .filter(el => el.offsetParent !== null);
    if (!this.items.length) return;
    const again = was ? this.items.indexOf(was) : -1;
    this.index = again >= 0 ? again : Math.min(this.index, this.items.length - 1);
    this.paint();
  }

  paint() {
    this.items.forEach((el, i) => el.classList.toggle('nav-on', i === this.index));
    const el = this.items[this.index];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Move the cursor. Up and down step through the list; left and right do too,
   * but by ROW, so a grid of colour swatches walks sideways the way it looks
   * like it should.
   */
  move(dx, dy) {
    if (!this.items.length) return;
    if (dy) {
      // step to the next item whose vertical position actually differs, so a
      // row of side-by-side buttons is one stop rather than three
      const here = this.items[this.index].getBoundingClientRect();
      const dir = dy > 0 ? 1 : -1;
      let best = -1, bestD = Infinity;
      this.items.forEach((el, i) => {
        if (i === this.index) return;
        const r = el.getBoundingClientRect();
        const dv = (r.top - here.top) * dir;
        if (dv < 6) return;                       // not in that direction
        const dh = Math.abs(r.left - here.left);
        const score = dv + dh * 0.35;
        if (score < bestD) { bestD = score; best = i; }
      });
      this.index = best >= 0 ? best : (this.index + dir + this.items.length) % this.items.length;
    } else if (dx) {
      const here = this.items[this.index].getBoundingClientRect();
      const dir = dx > 0 ? 1 : -1;
      let best = -1, bestD = Infinity;
      this.items.forEach((el, i) => {
        if (i === this.index) return;
        const r = el.getBoundingClientRect();
        if (Math.abs(r.top - here.top) > 8) return;     // different row
        const dh = (r.left - here.left) * dir;
        if (dh < 6) return;
        if (dh < bestD) { bestD = dh; best = i; }
      });
      this.index = best >= 0 ? best : (this.index + dir + this.items.length) % this.items.length;
    }
    this.paint();
  }

  activate() {
    const el = this.items[this.index];
    if (!el) return false;
    el.click();
    // the list may have rebuilt under us -- an upgrade bought, a relic taken
    setTimeout(() => this.scan(), 0);
    return true;
  }

  /**
   * Drive it from the pad. Held directions repeat, because holding down to
   * scroll a shop list is the obvious thing to try.
   */
  update(dt, pad) {
    if (!this.root || !pad) return;
    const nav = pad.navPressed();
    let dx = 0, dy = 0;
    if (nav.up) dy = -1;
    else if (nav.down) dy = 1;
    else if (nav.left) dx = -1;
    else if (nav.right) dx = 1;

    if (dx || dy) { this.move(dx, dy); this.repeat = 0.42; return; }

    const holdY = (pad.action('dpadDown') ? 1 : 0) - (pad.action('dpadUp') ? 1 : 0);
    const holdX = (pad.action('dpadRight') ? 1 : 0) - (pad.action('dpadLeft') ? 1 : 0);
    if (holdY || holdX) {
      this.repeat -= dt;
      if (this.repeat <= 0) { this.move(holdX, holdY); this.repeat = 0.13; }
    } else {
      this.repeat = 0;
    }
  }
}
