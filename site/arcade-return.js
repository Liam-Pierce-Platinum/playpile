import { GAMES, recent } from './arcade-shell.js';
import { favs } from './progress.js';
import { escapeHTML as esc } from './arcade-ui.js';
import { playUrl } from './seo.js';

const titles = new Map(GAMES.map(game => [game.slug, game]));

function savedGames() {
  const played = recent().map(game => game.slug);
  let favourite = [];
  try { favourite = favs(); } catch {}

  const recentSlugs = new Set(played);
  const favouriteSlugs = new Set(favourite);
  return [...new Set([...played, ...favourite])].map(slug => ({
    game: titles.get(slug),
    recent: recentSlugs.has(slug),
    favourite: favouriteSlugs.has(slug),
  })).filter(entry => entry.game);
}

function card({game, recent: played, favourite}) {
  const key = favourite ? (played ? 'returnBoth' : 'returnFavorite') : 'returnRecent';
  const label = favourite ? (played ? 'Recent · Favourite' : 'Favourite') : 'Recently played';
  return `<li><a class="return-card" href="${playUrl(game)}">
    <img src="/shots/t/${esc(game.slug)}.webp" width="64" height="48" alt="" loading="lazy">
    <span class="return-copy"><b>${esc(game.title)}</b><span class="return-status${favourite?' is-favourite':''}">${favourite?'<span aria-hidden="true">★</span> ':''}<span data-i18n="${key}">${label}</span></span></span>
  </a></li>`;
}

export function mountReturnShelf(el) {
  if (!el) return;
  let rendered;

  function paint() {
    const entries = savedGames();
    const signature = JSON.stringify(entries.map(({game, recent, favourite}) => [game.slug, recent, favourite]));
    if (signature === rendered) return;
    rendered = signature;

    const offset = el.querySelector('.return-strip')?.scrollLeft || 0;
    el.innerHTML = `<section class="return-shelf" id="back-for-more" aria-labelledby="returnTitle">
      <h2 id="returnTitle" data-i18n="returnTitle">Back for more?</h2>
      ${entries.length ? `<ul class="return-strip">${entries.map(card).join('')}</ul>`
        : '<p data-i18n="returnEmpty">Play a game or save a favourite to find it here.</p>'}
    </section>`;
    if (offset) el.querySelector('.return-strip')?.scrollTo(offset, 0);
  }

  paint();
  addEventListener('pp-account', paint);
  addEventListener('pp-progress', paint);
  addEventListener('pageshow', paint);
  addEventListener('storage', event => {
    if (!event.key || event.key === 'pd.recent' || event.key === 'pd.site.favs') paint();
  });
  if (location.hash === '#back-for-more') {
    requestAnimationFrame(() => {
      if (!el.hidden) el.querySelector('#back-for-more')?.scrollIntoView();
    });
  }
}
