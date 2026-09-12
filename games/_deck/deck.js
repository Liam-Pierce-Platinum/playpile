// =====================================================================
// PLAYPILE :: games/_deck/deck.js - THE CABINET ALL TEN GAMES SIT IN
// =====================================================================
//
// Ten small games written one after the other will otherwise be ten
// different answers to the same six questions: how big is the canvas on
// a phone, what is a frame, what counts as a tap, where does the high
// score live, what happens when the tab loses focus, and how do you make
// a noise without shipping an audio file. None of those are the game,
// and getting them wrong is what makes a browser game feel cheap.
//
// So they are answered once, here:
//
//   FIXED VIRTUAL RESOLUTION. Every game draws to the size it asks for
//   and the canvas is scaled to fit the window, letterboxed. A game can
//   therefore use real numbers - "the paddle is 90 wide" - and be the
//   same game on a 3440 monitor and a phone in portrait.
//
//   ONE INPUT. A mouse press, a finger and the space bar are the same
//   event, because on a site where half the traffic is a phone anything
//   else means writing every game twice.
//
//   dt IS CLAMPED. A tab that comes back after two minutes hands you a
//   120-second frame, and every physics game in the world tunnels
//   through its floor on that frame.
//
//   SOUND IS SYNTHESISED. No files to load, no licence to worry about,
//   and it starts on the first tap because browsers require that.
const KEYS_STOP = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'];

export class Deck {
  /**
   * @param {object} o
   * @param {string} o.key   slug, used for the high score in localStorage
   * @param {number} o.w     virtual width
   * @param {number} o.h     virtual height
   * @param {string} [o.bg]  background, painted before every frame
   */
  constructor(o) {
    this.key = o.key; this.W = o.w; this.H = o.h;
    this.bg = o.bg || '#0a0e14';
    this.cv = document.createElement('canvas');
    this.cv.width = this.W; this.cv.height = this.H;
    this.cv.style.cssText = 'display:block;touch-action:none;background:' + this.bg;
    (document.getElementById('app') || document.body).appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.t = 0; this.dt = 0; this.frame = 0; this.paused = false;
    // ?shot - "set yourself up to be photographed".
    //
    // The card for a game on the home page is a screenshot, and a
    // screenshot of a game on its title card is a screenshot of a title
    // card. Each game reads this and, if it is set, starts itself
    // mid-run with a board worth looking at. Nothing else uses it, and
    // it is the only concession any of these games make to the site.
    this.shot = /[?&]shot\b/.test(location.search);

    // ---- input ------------------------------------------------------
    this.keys = new Set();
    this.mouse = { x: this.W / 2, y: this.H / 2, down: false, dx: 0, dy: 0 };
    this._taps = 0;          // presses since the game last looked
    this._rels = 0;          // releases since the game last looked

    addEventListener('keydown', (e) => {
      if (KEYS_STOP.includes(e.key)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.key); this.keys.add(e.code); }
      if (!e.repeat && (e.code === 'Space' || e.key === 'Enter')) this._taps++;
      if (e.key === 'p' || e.key === 'P') this.paused = !this.paused;
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key); this.keys.delete(e.code);
      if (e.code === 'Space' || e.key === 'Enter') this._rels++;
    });

    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      if (!p) return null;
      return { x: (p.clientX - r.left) / r.width * this.W,
               y: (p.clientY - r.top) / r.height * this.H };
    };
    const move = (e) => {
      const p = pos(e); if (!p) return;
      this.mouse.dx = p.x - this.mouse.x; this.mouse.dy = p.y - this.mouse.y;
      this.mouse.x = p.x; this.mouse.y = p.y;
    };
    const down = (e) => {
      const p = pos(e); if (p) { this.mouse.x = p.x; this.mouse.y = p.y; }
      this.mouse.down = true; this._taps++; this._audio();
      if (e.cancelable) e.preventDefault();
    };
    const up = (e) => { this.mouse.down = false; this._rels++; };
    this.cv.addEventListener('mousemove', move);
    this.cv.addEventListener('mousedown', down);
    addEventListener('mouseup', up);
    this.cv.addEventListener('touchstart', (e) => { move(e); down(e); }, { passive: false });
    this.cv.addEventListener('touchmove', (e) => { move(e); if (e.cancelable) e.preventDefault(); }, { passive: false });
    addEventListener('touchend', up);

    // ---- fit --------------------------------------------------------
    const fit = () => {
      const pad = 0;
      const aw = innerWidth - pad, ah = innerHeight - pad;
      const s = Math.min(aw / this.W, ah / this.H);
      this.cv.style.width = Math.floor(this.W * s) + 'px';
      this.cv.style.height = Math.floor(this.H * s) + 'px';
    };
    addEventListener('resize', fit); fit();
    // A game that keeps running in a tab you cannot see is a game that
    // is over when you come back to it.
    //
    // AND EVERY KEY IS RELEASED WHEN FOCUS GOES. This is the bug Liam hit
    // in BRICKS as "it auto pushes left": hold a key, lose focus for any
    // reason - clicking outside the frame, alt-tab, the page scrolling -
    // and the keyup is delivered to somewhere else. The key is then held
    // for ever as far as the game is concerned, and the paddle drives
    // into the wall with nothing on the keyboard pressed. Nothing can
    // recover from that except clearing the set, so it is cleared here
    // for every game at once.
    const letGo = () => { this.keys.clear(); };
    addEventListener('blur', () => { this.paused = true; letGo(); });
    addEventListener('focus', letGo);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.paused = true; letGo(); }
    });
    addEventListener('pointerdown', () => { if (this.paused) this.paused = false; });
  }

  /** presses since you last asked. Space, click and tap are all one. */
  tapped() { const n = this._taps; this._taps = 0; return n; }
  released() { const n = this._rels; this._rels = 0; return n; }
  held(...k) { return k.some((x) => this.keys.has(x)); }

  // ---- high score ---------------------------------------------------
  get best() { try { return +localStorage.getItem('pd.best.' + this.key) || 0; } catch (e) { return 0; } }
  set best(v) { try { localStorage.setItem('pd.best.' + this.key, String(Math.round(v))); } catch (e) {} }
  /** returns true if this run beat the record */
  record(score) { if (score > this.best) { this.best = score; return true; } return false; }

  // ---- sound --------------------------------------------------------
  _audio() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  /** a short tone. type: sine square saw triangle */
  beep(f = 440, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(), gn = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(this.ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /** a burst of noise, for hits and crashes */
  noise(dur = 0.12, vol = 0.06, hp = 700) {
    if (!this.ac) return;
    const n = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(); s.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const gn = this.ac.createGain(); gn.gain.value = vol;
    s.connect(f); f.connect(gn); gn.connect(this.ac.destination); s.start();
  }

  // ---- the loop -----------------------------------------------------
  run(step) {
    let last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 1 / 20) dt = 1 / 20;        // see the note at the top
      if (this.paused) { this._pauseCard(); return; }
      this.dt = dt; this.t += dt; this.frame++;
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = this.bg; g.fillRect(0, 0, this.W, this.H);
      step(dt, g);
    };
    requestAnimationFrame(tick);
  }

  _pauseCard() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(6,9,13,.72)'; g.fillRect(0, 0, this.W, this.H);
    this.text('PAUSED', this.W / 2, this.H / 2 - 6, 20, '#e7ecf3', 'center');
    this.text('click to carry on', this.W / 2, this.H / 2 + 18, 11, '#8b96a8', 'center');
  }

  // ---- drawing helpers ---------------------------------------------
  text(s, x, y, size = 12, col = '#e7ecf3', align = 'left', mono = true) {
    const g = this.g;
    g.fillStyle = col;
    g.font = (mono ? '700 ' : '600 ') + size + 'px ' +
      (mono ? 'ui-monospace,Menlo,Consolas,monospace' : 'system-ui,sans-serif');
    g.textAlign = align; g.textBaseline = 'alphabetic';
    g.fillText(s, x, y);
    g.textAlign = 'left';
  }
  box(x, y, w, h, col, r = 0) {
    const g = this.g; g.fillStyle = col;
    if (!r) { g.fillRect(x, y, w, h); return; }
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
    g.fill();
  }
  /** the bar every one of these games has along the top */
  hud(left, right) {
    this.box(0, 0, this.W, 30, 'rgba(6,9,13,.55)');
    this.text(left, 12, 20, 13, '#e7ecf3');
    this.text(right, this.W - 12, 20, 12, '#8b96a8', 'right');
  }
  /** the card at the end of a run, and the one before it starts */
  card(title, lines, sub) {
    const g = this.g;
    g.fillStyle = 'rgba(6,9,13,.80)'; g.fillRect(0, 0, this.W, this.H);
    let y = this.H / 2 - 40;
    this.text(title, this.W / 2, y, 26, '#ff9f43', 'center'); y += 30;
    for (const l of lines) { this.text(l, this.W / 2, y, 13, '#e7ecf3', 'center'); y += 20; }
    if (sub) this.text(sub, this.W / 2, this.H / 2 + 62, 11, '#8b96a8', 'center');
  }
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
