import { mountShell, search } from './shell.js';
import { catUrl } from './seo.js';
import { translate, localizedGameQuery } from './arcade-locale.js';
import { mountReturnShelf } from './arcade-return.js';

function reduceMotion() {
  try { return localStorage.getItem('pd.ui.motion') === 'reduced'; }
  catch { return false; }
}

document.documentElement.classList.toggle('arcade-still', reduceMotion());

function legacyDestination(hash) {
  const params = new URLSearchParams(hash.slice(1));
  if (params.has('q')) return '/browse/?q=' + encodeURIComponent(params.get('q'));
  if (params.get('r') === 'recent') return '/browse/#back-for-more';
  if (params.has('r')) {
    const routes = { new:'/browse/new/', just:'/browse/new/', popular:'/browse/popular/', friends:'/free-multiplayer-games/' };
    return Object.hasOwn(routes, params.get('r')) ? routes[params.get('r')] : '/browse/';
  }
  if (params.has('c')) return catUrl(params.get('c'));
}

function mountCatalogue(feed) {
  const input = document.getElementById('q');
  const count = document.getElementById('gameCount');
  const clear = document.getElementById('clearSearch');
  const empty = document.getElementById('searchEmpty');
  const shelf = document.getElementById('returnShelf');
  if (shelf) mountReturnShelf(shelf);
  const cards = new Map(Array.from(feed.children, card => [card.dataset.slug, card]));
  let currentTerm = '';

  function filter(value, force = false) {
    const term = value.trim();
    if (term === currentTerm && !force) return;
    currentTerm = term;
    const visible = term ? search(localizedGameQuery(term)).map(game => cards.get(game.slug)).filter(Boolean) : [...cards.values()];
    feed.replaceChildren(...visible);
    count.textContent = term ? translate('resultCount',{count:visible.length,query:term}) : translate('gameCount',{count:cards.size});
    if (shelf) shelf.hidden = Boolean(term);
    clear.hidden = !term;
    empty.hidden = visible.length !== 0;
    const url = new URL(location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }

  input.value = new URLSearchParams(location.search).get('q') || '';
  filter(input.value);
  input.addEventListener('input', () => filter(input.value));
  addEventListener('pp-locale', () => filter(input.value, true));
  clear.addEventListener('click', () => {
    input.value = '';
    filter('');
    input.focus();
  });
  return filter;
}

const page = document.body.dataset.arcadePage;
const destination = (location.pathname === '/' || location.pathname === '/index.html') && legacyDestination(location.hash);
if (destination) location.replace(destination);
else if (page) {
  const feed = document.getElementById('gameFeed');
  mountShell({ active: page === 'profile' ? 'me' : page, onSearch: feed ? mountCatalogue(feed) : null });
}

const motionToggle = document.getElementById('reduceMotion');
if (motionToggle) {
  motionToggle.checked = reduceMotion();
  motionToggle.addEventListener('change', () => {
    try { localStorage.setItem('pd.ui.motion', motionToggle.checked ? 'reduced' : 'full'); } catch {}
    document.documentElement.classList.toggle('arcade-still', motionToggle.checked);
    dispatchEvent(new Event('pp-motion'));
  });
}
