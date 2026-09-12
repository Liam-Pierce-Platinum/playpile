// =====================================================================
// PLAYPILE :: ads/ads.js - EVERY ADVERTISING SLOT ON THE SITE
// =====================================================================
//
// Liam: *"add areas that I can monotize off of adds"*.
//
// Two things have to be true at once. The slots have to be REAL - the
// right standard sizes, in the places a games site actually earns from,
// laid out so that turning them on does not move the page around. And
// until there is an account behind them they have to be OBVIOUSLY not
// adverts: a dashed box that says what it is and where its id goes. A
// site with fake adverts drawn on it is a site you cannot show anybody.
//
// So: `ads/ads.json` holds the ids. With `enabled: false` (the state it
// ships in) every slot renders a labelled placeholder of exactly the
// size the real unit will be. Fill in a client id and the slot ids, set
// `enabled: true`, and the same boxes become live AdSense units without
// a single change to any page.
//
// WHERE THE SLOTS ARE, and why those:
//
//   home_leader   728x90  above the fold on the deck. The one everybody has.
//   home_inline   728x90  after the first row of cards - it reads as a
//                         shelf divider rather than an interruption.
//   play_leader   728x90  above the game, where the eye already is.
//   play_rail     300x250 beside the game. The rectangle is the best
//                         paying unit on the web and this is the only
//                         place on a game page it fits without crowding.
//   play_tall     300x600 under the rail on tall screens.
//   play_footer   728x90  under the description, for the people reading.
//   interstitial  300x250 in the panel that covers the loading game.
//
// WHAT IS DELIBERATELY NOT HERE: anything over the game while it is
// being played, anything that moves, anything that makes noise, and any
// unit inside the game frame. Those are the four that get a games site
// dropped by an ad network, and they are also why people leave.
let CFG = null;
const SIZES = {
  home_leader:  { w: 728, h: 90,  cls: 'ad-leader', label: 'leaderboard' },
  home_inline:  { w: 728, h: 90,  cls: 'ad-inline', label: 'in-feed' },
  play_leader:  { w: 728, h: 90,  cls: 'ad-leader', label: 'leaderboard' },
  play_rail:    { w: 300, h: 250, cls: 'ad-rail',   label: 'rectangle' },
  play_tall:    { w: 300, h: 600, cls: 'ad-tall',   label: 'half page' },
  play_footer:  { w: 728, h: 90,  cls: 'ad-inline', label: 'leaderboard' },
  interstitial: { w: 300, h: 250, cls: 'ad-rail',   label: 'rectangle' },
};

export async function loadAds() {
  if (CFG) return CFG;
  try {
    const r = await fetch('/ads/ads.json', { cache: 'no-store' });
    CFG = await r.json();
  } catch (e) {
    CFG = { enabled: false, interstitial: { enabled: false } };
  }
  if (CFG.enabled && CFG.network === 'adsense' && CFG.adsense && CFG.adsense.client) {
    // ONE script tag for the whole page, added once, only when it is
    // actually going to be used. An ad script on a page with no ad units
    // is a third-party request that costs the player a load and earns
    // nothing.
    if (!document.getElementById('adsense-lib')) {
      const s = document.createElement('script');
      s.id = 'adsense-lib';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='
            + encodeURIComponent(CFG.adsense.client);
      document.head.appendChild(s);
    }
  }
  return CFG;
}

/**
 * Put a slot into `el`.
 *
 * The element keeps the slot's dimensions whichever state it is in, so
 * switching the adverts on never reflows the page under a player - the
 * hole is the same size as the thing that fills it.
 */
export function slot(el, name) {
  if (!el) return;
  const sz = SIZES[name] || SIZES.play_rail;
  el.classList.add('ad', sz.cls);
  el.setAttribute('data-slot', name);

  const cfg = CFG || { enabled: false };
  const id = cfg.enabled && cfg.adsense && cfg.adsense.slots
    ? (cfg.adsense.slots[name] || '') : '';

  if (cfg.enabled && cfg.adsense && cfg.adsense.client && id) {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'inline-block';
    ins.style.width = sz.w + 'px';
    ins.style.height = sz.h + 'px';
    ins.setAttribute('data-ad-client', cfg.adsense.client);
    ins.setAttribute('data-ad-slot', id);
    el.innerHTML = '';
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    return;
  }

  if (cfg.houseAds && cfg.houseAds.enabled) { house(el, sz); return; }

  el.innerHTML = '<div class="ad-ph">'
    + '<b>AD SLOT</b>'
    + '<span>' + sz.label + ' &middot; ' + sz.w + '&times;' + sz.h + '</span>'
    + '<i>ads/ads.json &rarr; slots.' + name + '</i>'
    + '</div>';
}

/**
 * A house advert: one of Liam's own games, in the shape of an advert.
 *
 * This is what should sit in an unsold slot. An empty box earns nothing
 * and a dashed placeholder is for development; a card for HIGHRISE in
 * the same space sends a player to another game on the same site, which
 * is the thing that actually keeps a games site alive.
 */
function house(el, sz) {
  const picks = (window.__PLAYPILE_GAMES || []).filter((g) => g.big);
  const g = picks[Math.floor(Math.random() * picks.length)];
  if (!g) { el.innerHTML = '<div class="ad-ph"><b>AD SLOT</b></div>'; return; }
  el.innerHTML = '<a class="ad-ph" style="border-style:solid;border-color:#2a3a4d;'
    + 'text-align:left;place-items:start;gap:6px;padding:12px;text-transform:none;'
    + 'letter-spacing:0;color:#8b96a8;font-size:12px" href="/play/' + g.slug + '">'
    + '<b style="letter-spacing:.2em">' + g.title + '</b>'
    + '<span style="text-transform:none;letter-spacing:0;font-size:12px;line-height:1.5">'
    + g.blurb + '</span>'
    + '<i style="color:#ff9f43;letter-spacing:.14em">PLAY FREE &rarr;</i></a>';
}

/**
 * The loading interstitial.
 *
 * Shown over the START button while the game behind it boots, for a few
 * seconds, with a visible countdown and a skip. It is never shown twice
 * inside `minGapMinutes`, which is what stops the site feeling like a
 * toll road, and it is never shown over a game that is already running.
 *
 * Returns a promise that resolves when the player can go on.
 */
export function interstitial() {
  const cfg = CFG || {};
  const opt = cfg.interstitial || {};
  if (!opt.enabled) return Promise.resolve();

  const now = Date.now();
  const gap = (opt.minGapMinutes || 3) * 60000;
  let last = 0;
  try { last = +localStorage.getItem('pd.lastGate') || 0; } catch (e) {}
  if (now - last < gap) return Promise.resolve();
  try { localStorage.setItem('pd.lastGate', String(now)); } catch (e) {}

  const gate = document.getElementById('gate');
  if (!gate) return Promise.resolve();
  slot(gate.querySelector('[data-ad]'), 'interstitial');
  gate.classList.add('on');

  let left = Math.max(1, opt.seconds || 5);
  const label = gate.querySelector('.count');
  const skip = gate.querySelector('button');
  return new Promise((done) => {
    const finish = () => {
      clearInterval(t); gate.classList.remove('on');
      skip.removeEventListener('click', finish); done();
    };
    label.textContent = 'your game starts in ' + left;
    const t = setInterval(() => {
      left--;
      if (left <= 0) { skip.textContent = 'CONTINUE'; finish(); return; }
      label.textContent = 'your game starts in ' + left;
    }, 1000);
    skip.addEventListener('click', finish);
  });
}
