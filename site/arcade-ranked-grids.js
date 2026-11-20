import { GAMES, catOf, row } from './shell.js';
import { gameCardHTML } from './arcade-ui.js';
import { miniHtml } from './pages.js';
import { catUrl } from './seo.js';
import { onRankingChange, rankGames } from './game-ranking.js';

// Reuse the crawled HTML, loaded thumbnails and translated text when cards move.
export function bindCards(grid, renderCard = gameCardHTML) {
  const cards = new Map(Array.from(grid.children, el => [el.dataset.slug, el]));
  const template = document.createElement('template');
  return function show(games) {
    const desired = new Set(games.map(game => game.slug));
    for (const child of Array.from(grid.children)) {
      if (!desired.has(child.dataset.slug)) child.remove();
    }
    let next = grid.firstElementChild;
    for (const game of games) {
      let card = cards.get(game.slug);
      if (!card) {
        template.innerHTML = renderCard(game);
        card = template.content.firstElementChild;
        cards.set(game.slug, card);
      }
      if (card === next) next = next.nextElementSibling;
      else grid.insertBefore(card, next);
    }
  };
}

// Let a player finish clicking or navigating a list before refreshing its order.
export function watchRanking(grids, render) {
  let pending = false;
  function refresh() {
    pending = grids.some(grid => grid.contains(document.activeElement) || grid.querySelector('a:active'));
    if (!pending) render();
  }
  function afterInteraction() { if (pending) setTimeout(refresh, 0); }
  for (const grid of grids) grid.addEventListener('focusout', afterInteraction);
  document.addEventListener('pointerup', afterInteraction, { passive: true });
  document.addEventListener('pointercancel', afterInteraction, { passive: true });
  onRankingChange(refresh);
}

export function mountCategoryGames(grid) {
  if (grid.dataset.gameOrder === 'newest') return;
  const initialSlugs = Array.from(grid.children, card => card.dataset.slug);
  const bySlug = new Map(GAMES.map(game => [game.slug, game]));
  const initial = initialSlugs.map(slug => bySlug.get(slug)).filter(Boolean);
  const popularOnly = grid.dataset.gameOrder === 'popular';
  // Keep the featured fallback for an empty leaderboard, while allowing every
  // game to enter the Popular list once aggregate plays are available.
  const candidates = popularOnly
    ? [...initial, ...GAMES.filter(game => !initialSlugs.includes(game.slug))]
    : initial;
  const show = bindCards(grid);
  function render() { show(rankGames(candidates, { popularOnly }).slice(0, initial.length)); }
  render();
  watchRanking([grid], render);
}

export function mountRelatedGames(game, rail, rows) {
  const others = GAMES.filter(item => item.slug !== game.slug);
  const category = catOf(game);
  const same = others.filter(item => catOf(item) === category);
  const rest = others.filter(item => catOf(item) !== category);
  const showRail = bindCards(rail, miniHtml);
  const groups = [
    { title: 'More ' + category + ' games', href: catUrl(category), games: same },
    { title: 'You might also like', href: '/browse/', games: rest },
  ].filter(group => group.games.length);
  rows.innerHTML = groups.map(group => row(group.title, group.games.slice(0, 4), { seeAll: group.href })).join('');
  const showRows = Array.from(rows.querySelectorAll('.strip'), grid => bindCards(grid));
  function render() {
    const rankedGroups = groups.map(group => rankGames(group.games));
    showRail(rankedGroups.flat().slice(0, 5));
    rankedGroups.forEach((list, index) => showRows[index](list.slice(0, 4)));
  }
  render();
  watchRanking([rail, rows], render);
}
