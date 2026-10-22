// =====================================================================
// PLAYPILE :: site/pages.js - THE WORDS ON A PAGE, AS HTML STRINGS
// =====================================================================
//
// AdSense turned the site down for "low value content" (2026-10-07). It
// was right about what it SAW: every page here was an empty template a
// module filled in after load, so a crawler reading the source found a
// game page with the word GAME on it and nothing else, and no category
// page at all - categories were #hash views of the home page.
//
// So the text is now rendered TWICE FROM ONE PLACE: tools/deploy.mjs
// imports this file in node and writes the finished HTML into every page
// it builds, and the same pages import it in the browser when they are
// served locally. Pure functions, no imports, no DOM - which is the only
// thing that lets node and a browser both run it.

import { playUrl, catUrl, kwOf, CAT_TITLE } from './seo.js';
import { isOnline } from './multiplayer.js';
export { playUrl, catUrl, kwOf, CAT_TITLE };
export const SITE = 'https://playpile.net';

export const catOf = (g) => g.cat || g.tag || 'Games';
export const catSlug = (c) => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// a catalogue `about` may hold several paragraphs, split by a blank line
export const aboutHtml = (g) => String(g.about || '').split(/\n\s*\n/).map(clean)
  .filter(Boolean).map((p) => '<p>' + esc(p) + '</p>').join('\n')
  + (g.content ? '\n<p class="advisory"><b>What is in it:</b> ' + esc(g.content)
    + ' <a href="/site/parents.html">More for parents</a></p>' : '')
  + '\n<p class="report"><a href="mailto:liamlikescows@gmail.com?subject='
  + encodeURIComponent('PLAYPILE: problem with ' + g.title) + '">Report a problem with this game</a></p>';

export const keysHtml = (g) => (g.controls || [])
  .map(([k, w]) => '<li><kbd>' + esc(k) + '</kbd><span>' + esc(w) + '</span></li>').join('');

export const tagsHtml = (g) => [catOf(g), ...(g.tags || [])].map((t, i) => i
  ? '<a class="chip" href="/#q=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'
  : '<a class="chip on" href="' + catUrl(t) + '">' + esc(t) + '</a>').join('');

export const crumbsHtml = (g) => '<a href="/">Games</a><i>&rsaquo;</i>'
  + '<a href="' + catUrl(catOf(g)) + '">' + esc(catOf(g)) + '</a>'
  + '<i>&rsaquo;</i><b>' + esc(g.title) + '</b>';

const UP = { fps: 'FPS', rpg: 'RPG', '3d': '3D', f1: 'F1', io: 'io' };
const cap = (s) => s.split(' ').map((w) => UP[w] || (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
export const pageTitle = (g) => g.title + ' — Free ' + cap(kwOf(g)) + ' Online | PLAYPILE';

// the card, identical to shell.js's so a pre-rendered row is the same row
const shot = (g) => '<img src="/shots/t/' + g.slug + '.webp" alt="' + esc(g.title + ' - ' + kwOf(g)) + '" width="640" height="360" loading="lazy" decoding="async" onerror="this.remove()"'
  + ' onload="if(this.naturalHeight>this.naturalWidth)this.classList.add(\'tall\')">';
export const cardHtml = (g) => '<a class="card" href="' + playUrl(g) + '" title="' + esc(g.title) + '" data-slug="' + g.slug + '">'
  + '<span class="thumb"><span class="ph">' + esc(g.title.slice(0, 2)) + '</span>' + shot(g)
  + '<span class="badge">' + esc(catOf(g)) + '</span>'
  + (g.big ? '<span class="big-flag">Big</span>' : '')
  + (isOnline(g.slug) ? '<span class="online-flag">Online</span>' : '')
  + '<span class="hover"><span>PLAY</span></span></span>'
  + '<span class="cname">' + esc(g.title) + '</span>'
  + '<span class="cmeta">' + (g.tags || []).filter((t) => t !== 'new').slice(0, 2).map(esc).join(' &middot; ') + '</span></a>';

// ---------------------------------------------------------------------
// a game page: <head> extras and the body text
// ---------------------------------------------------------------------
// `rating` is { a, n } from the shared database, or nothing. AggregateRating
// goes in ONLY with at least 3 real votes: an invented or seeded rating is
// against Google's structured-data policy and gets a site penalised.
export function gameHead(g, rating) {
  const url = SITE + playUrl(g);
  const img = SITE + '/shots/' + g.slug + '.png';
  const desc = clean(g.blurb) + ' Free to play in your browser - no download, no sign-up.';
  const ld = {
    '@context': 'https://schema.org', '@type': 'VideoGame',
    name: g.title, url, image: img, description: clean(g.blurb),
    genre: catOf(g), gamePlatform: 'Web browser', operatingSystem: 'Any',
    applicationCategory: 'Game', isAccessibleForFree: true,
    ...(g.content ? { contentRating: g.content } : {}),
    ...(rating && rating.n >= 3 && rating.a >= 1 && rating.a <= 5 ? { aggregateRating: {
      '@type': 'AggregateRating', ratingValue: Math.round(rating.a * 10) / 10, ratingCount: rating.n,
      bestRating: 5, worstRating: 1 } } : {}),
    publisher: { '@type': 'Organization', name: 'PLAYPILE', url: SITE },
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Games', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: catOf(g), item: SITE + catUrl(catOf(g)) },
      { '@type': 'ListItem', position: 3, name: g.title, item: url },
    ],
  };
  return '<title>' + esc(pageTitle(g)) + '</title>\n'
    + '<meta name="description" content="' + esc(desc) + '">\n'
    + '<link rel="canonical" href="' + url + '">\n'
    + '<meta property="og:type" content="website">\n'
    + '<meta property="og:site_name" content="PLAYPILE">\n'
    + '<meta property="og:title" content="' + esc(g.title + ' — PLAYPILE') + '">\n'
    + '<meta property="og:description" content="' + esc(desc) + '">\n'
    + '<meta property="og:url" content="' + url + '">\n'
    + '<meta property="og:image" content="' + img + '">\n'
    + '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n'
    + '<script type="application/ld+json">' + JSON.stringify(crumbs) + '</script>';
}

// the rail beside the game: same category first, then the catalogue in
// order. Deterministic on purpose - the build and the browser agree.
export function related(g, GAMES, n = 5) {
  const others = GAMES.filter((x) => x.slug !== g.slug);
  const same = others.filter((x) => catOf(x) === catOf(g));
  return [...same, ...others.filter((x) => catOf(x) !== catOf(g))].slice(0, n);
}
export const miniHtml = (x) => '<a class="mini" href="' + playUrl(x) + '">'
  + '<span class="th" style="background-image:url(\'/shots/t/' + x.slug + '.webp\')"></span>'
  + '<span><b>' + esc(x.title) + '</b><small>' + esc(catOf(x)) + '</small></span></a>';

// ---------------------------------------------------------------------
// a category page
// ---------------------------------------------------------------------
export function categoryHead(cat, intro) {
  const url = SITE + catUrl(cat);
  const desc = clean(intro).slice(0, 155);
  return '<title>' + esc((CAT_TITLE[cat] || cat + ' games') + ' — Play Online, No Download | PLAYPILE') + '</title>\n'
    + '<meta name="description" content="' + esc(desc) + '">\n'
    + '<link rel="canonical" href="' + url + '">\n'
    + '<meta property="og:title" content="' + esc(cat + ' games — PLAYPILE') + '">\n'
    + '<meta property="og:description" content="' + esc(desc) + '">\n'
    + '<meta property="og:url" content="' + url + '">';
}
export function categoryBody(cat, list, intro) {
  return '<section class="cathero"><h1>' + esc(CAT_TITLE[cat] || cat + ' games') + '</h1>'
    + '<p>' + esc(clean(intro)) + '</p></section>'
    + '<div class="strip">' + list.map(cardHtml).join('') + '</div>'
    + '<div class="catlist">' + list.map((g) =>
      '<article><h2><a href="' + playUrl(g) + '">' + esc(g.title) + '</a></h2>'
      + '<p class="lede">' + esc(clean(g.blurb)) + '</p>'
      + '<p>' + esc(clean(String(g.about).split(/\n\s*\n/)[0])) + '</p>'
      + '<p class="more"><a href="' + playUrl(g) + '">Play ' + esc(g.title) + ', the free ' + esc(kwOf(g))
      + ', and read the guide &rarr;</a></p></article>').join('') + '</div>';
}

// ---------------------------------------------------------------------
// the home page's A to Z: every game as a line of real text and a link
// ---------------------------------------------------------------------
export function directoryHtml(GAMES) {
  const cats = [...new Set(GAMES.map(catOf))].sort();
  return '<h2>Every game on PLAYPILE</h2>'
    + cats.map((c) => '<h3><a href="' + catUrl(c) + '">' + esc(c) + '</a></h3><ul>'
      + GAMES.filter((g) => catOf(g) === c).map((g) =>
        '<li><a href="' + playUrl(g) + '"><b>' + esc(g.title) + '</b></a> &mdash; '
        + esc(clean(g.blurb)) + '</li>').join('') + '</ul>').join('');
}
