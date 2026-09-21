// =====================================================================
// PLAYPILE :: site/shell.js - THE CHROME EVERY PAGE WEARS
// =====================================================================
//
// The top bar, the category sidebar, the footer, the cards and the
// search - written once and mounted by every page, so the site is the
// same shape wherever you land in it. This is the piece that turns a
// list of games into a portal.
//
// IT READS site/catalogue.js AND NOTHING ELSE. The sidebar is not a
// hardcoded menu: it is built from the `cat` field of the 23 games, with
// the count beside each one. Give a game a new category in catalogue.js
// and it appears in the menu on its own, on every page, with no second
// list to keep in step.
//
// ROUTING, such as it is. There is no router - a static host has no
// server to ask - so a category is a HASH on the home page:
//
//   /#c=Arcade     every Arcade game
//   /#q=snake      everything matching "snake"
//   /            the front page
//
// which works identically on localhost:8170 and on playpile.net, is
// bookmarkable, and never 404s.
import { GAMES } from '/site/catalogue.js';

// ---------------------------------------------------------------------
// ICONS
// ---------------------------------------------------------------------
// Plain 24x24 paths, drawn here rather than pulled off a CDN: an icon
// font is 40 KB and a network round trip for eighteen shapes, and half
// of it would be missing on the one machine that blocks the CDN.
const I = {
  home:   'M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  fire:   'M12 2c1 3.2-.6 4.6-2 6-1.7 1.7-3 3.2-3 5.6A5.4 5.4 0 0 0 12 19a5.4 5.4 0 0 0 5-5.4c0-3-2-4.3-2-7-1 1.2-1.6 1.7-2.3 1.7C11.6 8.3 12.6 5.4 12 2z',
  new:    'M12 3l2.1 5.2L19.8 9l-4 4 1 5.7-4.8-2.8L7.2 18.7l1-5.7-4-4 5.7-.8z',
  clock:  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm.9 4.6h-1.8v5.1l4.1 2.5.9-1.5-3.2-1.9z',
  grid:   'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  action: 'M13.5 2 4 13.8h6L9.5 22 20 9.6h-6.8z',
  adventure:'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 4.4A2.6 2.6 0 1 1 12 11.6a2.6 2.6 0 0 1 0-5.2z',
  arcade: 'M7 4h10a3 3 0 0 1 3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a3 3 0 0 1 3-3zm1 3v4h8V7zm-1 7v2h3v-2zm7 0v2h3v-2z',
  classic:'M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm3 3v4h2v-4zm8 0v4h2v-4zm-5 0v4h4v-4z',
  driving:'M5 11l1.5-4.4A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.6L19 11h1v6h-3v2h-3v-2H10v2H7v-2H4v-6zm2.6-.6h8.8l-.9-3H8.5zM6.8 13a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm10.4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  horror: 'M12 2a8 8 0 0 0-8 8v9.2c0 .9 1 1.4 1.7.8l1.6-1.3 1.7 1.4a1 1 0 0 0 1.3 0l1.7-1.4 1.7 1.4a1 1 0 0 0 1.3 0l1.6-1.4 1.7 1.3c.7.6 1.7.1 1.7-.8V10a8 8 0 0 0-8-8zM9 9.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm6 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  puzzle: 'M10 3h4a1 1 0 0 1 1 1v1.6a1.6 1.6 0 1 0 3.2 0V4h1.3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.6a1.6 1.6 0 1 0 0 3.2H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-6v-2.2a1.8 1.8 0 1 0-3.6 0V20H4a1 1 0 0 1-1-1v-6h1.6a1.7 1.7 0 1 0 0-3.4H3V4a1 1 0 0 1 1-1h5z',
  shooter:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 2.1a7 7 0 0 1 5.9 5.9H17V13h1.9A7 7 0 0 1 13 18.9V17h-2v1.9A7 7 0 0 1 5.1 13H7v-2H5.1A7 7 0 0 1 11 5.1V7h2zm-1 5.1a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
  sport:  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 0 1 4.2 1.4L12 9.7 7.8 6.4A7 7 0 0 1 12 5zM6.2 7.9 10.3 11l-1.6 4.9H4.6A7 7 0 0 1 6.2 7.9zm11.6 0a7 7 0 0 1 1.6 8h-4.1L13.7 11zM9.9 17.9h4.2l1.3 1.8a7 7 0 0 1-6.8 0z',
  strategy:'M12 2.6 4 6.2v5.4c0 4.7 3.4 8.3 8 9.8 4.6-1.5 8-5.1 8-9.8V6.2zm0 2.2 6 2.7v4.1c0 3.5-2.4 6.3-6 7.6-3.6-1.3-6-4.1-6-7.6V7.5z',
  skill:  'M12 2 9.2 8.9 2 9.6l5.4 4.7L5.8 21 12 17.3 18.2 21l-1.6-6.7L22 9.6l-7.2-.7z',
  info:   'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-1 4h2v2h-2zm0 4h2v6h-2z',
  tag:    'M11 3H4a1 1 0 0 0-1 1v7l9.5 9.5a1.5 1.5 0 0 0 2.1 0l6.9-6.9a1.5 1.5 0 0 0 0-2.1zM7 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
};
const CAT_ICON = {
  Action: 'action', Adventure: 'adventure', Arcade: 'arcade', Classic: 'classic',
  Driving: 'driving', Horror: 'horror', Puzzle: 'puzzle', Shooter: 'shooter',
  Sport: 'sport', Strategy: 'strategy', Skill: 'skill',
};
export const svg = (n) =>
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="'
  + (I[n] || I.grid) + '"/></svg>';

// ---------------------------------------------------------------------
// CATEGORIES, DERIVED
// ---------------------------------------------------------------------
// Not a list. Every category that has at least one game in it, most
// games first, so the menu reflects what is actually on the site.
export function categories() {
  const n = new Map();
  for (const g of GAMES) n.set(g.cat, (n.get(g.cat) || 0) + 1);
  return [...n].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const catOf = (g) => g.cat || g.tag || 'Games';

// ---------------------------------------------------------------------
// SEARCH
// ---------------------------------------------------------------------
// Title, category and tags, all client side over 23 objects - there is
// nothing here worth a server for.
//
// TWO RULES, and both of them are there because of something the first
// version got wrong:
//
//   every word must match, so "2 player sport" NARROWS the list rather
//   than widening it the way an OR search would;
//
//   a word matches the START OF A WORD, not any substring. Plain
//   `includes` had "2 player" returning HIGHRISE, because "2" is inside
//   "2000s" in its description and "player" is inside "singleplayer".
//   Matching word starts keeps "puz" finding Puzzle - which is the thing
//   you actually want from a search box - without that nonsense.
export function search(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return GAMES.slice();
  return GAMES.filter((g) => {
    const toks = (g.title + ' ' + catOf(g) + ' ' + (g.tag || '') + ' '
      + (g.tags || []).join(' ') + ' ' + g.blurb)
      .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.every((w) => toks.some((t) => t.startsWith(w)));
  });
}

// ---------------------------------------------------------------------
// RECENTLY PLAYED
// ---------------------------------------------------------------------
// Kept in this browser, like the scores. It is the row a portal earns
// the most repeat visits from and it costs nothing to store.
export function recent() {
  try {
    const a = JSON.parse(localStorage.getItem('pd.recent') || '[]');
    return a.map((s) => GAMES.find((g) => g.slug === s)).filter(Boolean);
  } catch (e) { return []; }
}
export function remember(slug) {
  try {
    const a = JSON.parse(localStorage.getItem('pd.recent') || '[]').filter((s) => s !== slug);
    a.unshift(slug);
    localStorage.setItem('pd.recent', JSON.stringify(a.slice(0, 12)));
  } catch (e) {}
}

// ---------------------------------------------------------------------
// CARDS
// ---------------------------------------------------------------------
// The shot is an <img> over the initials, and it REMOVES ITSELF if the
// file is missing - so a game with no screenshot yet still shows a
// deliberate looking tile instead of a broken image icon.
const shot = (g) =>
  '<img src="/shots/' + g.slug + '.png" alt="" loading="lazy" onerror="this.remove()"'
  + ' onload="if(this.naturalHeight>this.naturalWidth)this.classList.add(\'tall\')">';

export function card(g) {
  return '<a class="card" href="/play/' + g.slug + '" title="' + g.title + '">'
    + '<span class="thumb">'
    + '<span class="ph">' + g.title.slice(0, 2) + '</span>'
    + shot(g)
    + '<span class="badge">' + catOf(g) + '</span>'
    + (g.big ? '<span class="big-flag">Big</span>' : '')
    + '<span class="hover"><span>PLAY</span></span>'
    + '</span>'
    + '<span class="cname">' + g.title + '</span>'
    + '<span class="cmeta">' + (g.tags || []).slice(0, 2).join(' &middot; ') + '</span>'
    + '</a>';
}

export function tile(g) {
  return '<a class="tile" href="/play/' + g.slug + '" title="' + g.title + '">'
    + '<span class="ph">' + g.title.slice(0, 2) + '</span>'
    + shot(g)
    + '<span class="cap">' + g.title + '</span>'
    + '</a>';
}

export function row(heading, list, opts = {}) {
  if (!list.length) return '';
  return '<section class="row"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>'
    + '<div class="rowhead"><h2>' + heading + '</h2>'
    + '<span class="n">' + list.length + '</span>'
    + (opts.seeAll ? '<a class="seeall" href="' + opts.seeAll + '">See all <span>&rsaquo;</span></a>' : '')
    + '</div>'
    + '<div class="strip' + (opts.wide ? ' wide' : '') + '">' + list.map(card).join('') + '</div>'
    + '</section>';
}

// THE FOOTER IS NOT BUILT HERE. It is written into every page as real
// HTML, on purpose: an AdSense reviewer and a search engine both read
// the page before a module runs, and tools/ready.mjs checks the SOURCE
// of the home page for the privacy and cookie links. A footer this file
// injected was invisible to all three, and that check failed.

// ---------------------------------------------------------------------
// MOUNT
// ---------------------------------------------------------------------
// Every page calls this once. `active` is what to light up in the rail:
// 'home', or a category name.
export function mountShell({ active = '', onSearch = null } = {}) {
  // the house-ad code picks a game out of this
  window.__PLAYPILE_GAMES = GAMES;

  const nav = document.getElementById('sidenav');
  if (nav) {
    const link = (href, ic, text, n, on) =>
      '<a class="navlink' + (on ? ' on' : '') + '" href="' + href + '">' + svg(ic)
      + '<span class="t">' + text + '</span>'
      + (n ? '<span class="n">' + n + '</span>' : '') + '</a>';

    const rec = recent().length;
    let html = '<nav>'
      + link('/', 'home', 'Home', '', active === 'home')
      + link('/#r=new', 'new', 'New', '', active === 'new')
      + link('/#r=popular', 'fire', 'Popular', '', active === 'popular')
      + (rec ? link('/#r=recent', 'clock', 'Recently played', rec, active === 'recent') : '')
      + '</nav>'
      + '<div class="navhead">Categories</div><nav>';
    for (const c of categories()) {
      html += link('/#c=' + encodeURIComponent(c.name), CAT_ICON[c.name] || 'grid',
                   c.name, c.count, active === c.name);
    }
    html += '</nav>'
      + '<div class="navrule"></div>'
      + '<nav>' + link('/site/about.html', 'info', 'About', '', active === 'about') + '</nav>'
      + '<div class="navsmall">'
      + '<a href="/site/advertise.html">Advertise</a>'
      + '<a href="/site/privacy.html">Privacy</a>'
      + '<a href="/site/cookies.html">Cookies</a>'
      + '</div>'
      + '<p class="navfoot">&copy; 2026 PLAYPILE</p>';
    nav.innerHTML = html;
  }

  // ---- the drawer, on a phone -------------------------------------
  const burger = document.getElementById('burger');
  const scrim = document.getElementById('scrim');
  const shut = () => document.body.classList.remove('navopen');
  if (burger) burger.addEventListener('click', () => document.body.classList.toggle('navopen'));
  if (scrim) scrim.addEventListener('click', shut);
  if (nav) nav.addEventListener('click', (e) => { if (e.target.closest('a')) shut(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });

  // ---- search -------------------------------------------------------
  // On the home page it filters in place as you type. Anywhere else
  // there is nothing to filter, so Enter takes you home with the query
  // in the hash - which is also a link you can send somebody.
  const form = document.getElementById('searchForm');
  const q = document.getElementById('q');
  if (form && q) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSearch) { onSearch(q.value); return; }
      location.href = '/#q=' + encodeURIComponent(q.value.trim());
    });
    if (onSearch) {
      let t = 0;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => onSearch(q.value), 110);
      });
    }
  }

}

export { GAMES };
