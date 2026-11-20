import { GAMES } from './catalogue.js';
import { seoSlug, OLD_SEO } from './seo.js';

// All public aliases report the catalogue ID, never a full URL or query string.
const gameIds = new Set(GAMES.map(game => game.slug));
const playIds = new Map();
for (const game of GAMES) {
  for (const alias of [game.slug, seoSlug(game), OLD_SEO[game.slug]]) {
    if (alias) playIds.set(alias, game.slug);
  }
}

export function gameForPath(pathname) {
  const route = /^\/(play|games)\/([a-z0-9-]+)(?:\/|\/index\.html)?$/.exec(pathname || '');
  if (!route) return null;
  return route[1] === 'play' ? playIds.get(route[2]) || null :
    gameIds.has(route[2]) ? route[2] : null;
}
