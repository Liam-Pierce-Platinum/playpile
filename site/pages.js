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

export const SITE = 'https://playpile.net';

export const catOf = (g) => g.cat || g.tag || 'Games';
export const catSlug = (c) => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// a catalogue `about` may hold several paragraphs, split by a blank line
export const aboutHtml = (g) => String(g.about || '').split(/\n\s*\n/).map(clean)
  .filter(Boolean).map((p) => '<p>' + esc(p) + '</p>').join('\n');

export const keysHtml = (g) => (g.controls || [])
  .map(([k, w]) => '<li><kbd>' + esc(k) + '</kbd><span>' + esc(w) + '</span></li>').join('');

export const tagsHtml = (g) => [catOf(g), ...(g.tags || [])].map((t, i) => i
  ? '<a class="chip" href="/#q=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'
  : '<a class="chip on" href="/category/' + catSlug(t) + '/">' + esc(t) + '</a>').join('');

export const crumbsHtml = (g) => '<a href="/">Games</a><i>&rsaquo;</i>'
  + '<a href="/category/' + catSlug(catOf(g)) + '/">' + esc(catOf(g)) + '</a>'
  + '<i>&rsaquo;</i><b>' + esc(g.title) + '</b>';

export const pageTitle = (g) => g.title + ' — free ' + catOf(g).toLowerCase()
  + ' game in your browser — PLAYPILE';

// the card, identical to shell.js's so a pre-rendered row is the same row
const shot = (g) => '<img src="/shots/' + g.slug + '.png" alt="' + esc(g.title) + '" loading="lazy" onerror="this.remove()"'
  + ' onload="if(this.naturalHeight>this.naturalWidth)this.classList.add(\'tall\')">';
export const cardHtml = (g) => '<a class="card" href="/play/' + g.slug + '/" title="' + esc(g.title) + '">'
  + '<span class="thumb"><span class="ph">' + esc(g.title.slice(0, 2)) + '</span>' + shot(g)
  + '<span class="badge">' + esc(catOf(g)) + '</span>'
  + (g.big ? '<span class="big-flag">Big</span>' : '')
  + '<span class="hover"><span>PLAY</span></span></span>'
  + '<span class="cname">' + esc(g.title) + '</span>'
  + '<span class="cmeta">' + (g.tags || []).filter((t) => t !== 'new').slice(0, 2).map(esc).join(' &middot; ') + '</span></a>';

// ---------------------------------------------------------------------
// a game page: <head> extras and the body text
// ---------------------------------------------------------------------
export function gameHead(g) {
  const url = SITE + '/play/' + g.slug + '/';
  const img = SITE + '/shots/' + g.slug + '.png';
  const desc = clean(g.blurb) + ' Free to play in your browser - no download, no sign-up.';
  const ld = {
    '@context': 'https://schema.org', '@type': 'VideoGame',
    name: g.title, url, image: img, description: clean(g.blurb),
    genre: catOf(g), gamePlatform: 'Web browser', operatingSystem: 'Any',
    applicationCategory: 'Game', isAccessibleForFree: true,
    publisher: { '@type': 'Organization', name: 'PLAYPILE', url: SITE },
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Games', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: catOf(g), item: SITE + '/category/' + catSlug(catOf(g)) + '/' },
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
export const miniHtml = (x) => '<a class="mini" href="/play/' + x.slug + '/">'
  + '<span class="th" style="background-image:url(\'/shots/' + x.slug + '.png\')"></span>'
  + '<span><b>' + esc(x.title) + '</b><small>' + esc(catOf(x)) + '</small></span></a>';

// ---------------------------------------------------------------------
// a category page
// ---------------------------------------------------------------------
export function categoryHead(cat, intro) {
  const url = SITE + '/category/' + catSlug(cat) + '/';
  const desc = clean(intro).slice(0, 155);
  return '<title>' + esc(cat + ' games — play free in your browser — PLAYPILE') + '</title>\n'
    + '<meta name="description" content="' + esc(desc) + '">\n'
    + '<link rel="canonical" href="' + url + '">\n'
    + '<meta property="og:title" content="' + esc(cat + ' games — PLAYPILE') + '">\n'
    + '<meta property="og:description" content="' + esc(desc) + '">\n'
    + '<meta property="og:url" content="' + url + '">';
}
export function categoryBody(cat, list, intro) {
  return '<section class="cathero"><h1>' + esc(cat) + ' games</h1>'
    + '<p>' + esc(clean(intro)) + '</p></section>'
    + '<div class="strip">' + list.map(cardHtml).join('') + '</div>'
    + '<div class="catlist">' + list.map((g) =>
      '<article><h2><a href="/play/' + g.slug + '/">' + esc(g.title) + '</a></h2>'
      + '<p class="lede">' + esc(clean(g.blurb)) + '</p>'
      + '<p>' + esc(clean(String(g.about).split(/\n\s*\n/)[0])) + '</p>'
      + '<p class="more"><a href="/play/' + g.slug + '/">Play ' + esc(g.title)
      + ' and read the guide &rarr;</a></p></article>').join('') + '</div>';
}

// ---------------------------------------------------------------------
// the home page's A to Z: every game as a line of real text and a link
// ---------------------------------------------------------------------
export function directoryHtml(GAMES) {
  const cats = [...new Set(GAMES.map(catOf))].sort();
  return '<h2>Every game on PLAYPILE</h2>'
    + cats.map((c) => '<h3><a href="/category/' + catSlug(c) + '/">' + esc(c) + '</a></h3><ul>'
      + GAMES.filter((g) => catOf(g) === c).map((g) =>
        '<li><a href="/play/' + g.slug + '/"><b>' + esc(g.title) + '</b></a> &mdash; '
        + esc(clean(g.blurb)) + '</li>').join('') + '</ul>').join('');
}
