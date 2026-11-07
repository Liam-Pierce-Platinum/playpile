import { playUrl } from './seo.js';
import { isOnline } from './multiplayer.js';
import { WORLDS, worldFor } from './arcade-data.js';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const mascotHTML = kind => `<pp-character kind="${escapeHTML(kind)}" aria-hidden="true"></pp-character>`;
export function gameCardHTML(g) {
  const hue=worldFor(g.cat).color;
  const device=(g.tags||[]).includes('desktop')?'Mouse + keys':isOnline(g.slug)?'Play online':(g.tags||[]).includes('mobile')?'Touch friendly':'Jump in';
  return `<a class="card cartridge" href="${playUrl(g)}" data-slug="${escapeHTML(g.slug)}" style="--game-color:${hue}"><span class="cartridge-top"><span>${escapeHTML(g.cat)}</span><span class="cartridge-dot" aria-hidden="true"></span></span><span class="thumb"><span class="ph" aria-hidden="true">${escapeHTML(g.title.slice(0,2))}</span><img src="/shots/t/${escapeHTML(g.slug)}.webp" alt="${escapeHTML(g.title)} gameplay" width="640" height="360" loading="lazy" decoding="async" onerror="this.hidden=true"><span class="hover"><span>LET’S PLAY →</span></span></span><span class="cartridge-copy"><span class="cname">${escapeHTML(g.title)}</span><span class="card-hook">${escapeHTML(g.blurb)}</span><span class="cmeta">${device}<span aria-hidden="true">↗</span></span></span></a>`;
}
export function worldCardHTML(world,count) {
  return `<a class="world-card" href="${world.href}" style="--world-color:${world.color}"><span class="world-number">${String(WORLDS.indexOf(world)+1).padStart(2,'0')}</span><span class="world-stage">${mascotHTML(world.id)}</span><span class="world-label"><span class="world-name">${escapeHTML(world.name)}</span><span class="world-count">${count} games</span></span><span class="world-hook">${escapeHTML(world.hook)}<span aria-hidden="true">→</span></span></a>`;
}
export function worldHeroHTML(world,count) {
  return `<section class="world-hero" style="--world-color:${world.color}"><div><a class="backlink" href="/browse/">← Pick a category</a><div class="eyebrow">${world.note||'Choose your game'} · ${count} games</div><h1>${escapeHTML(world.name)}</h1><p class="world-catch">${escapeHTML(world.hook)}</p><p>${escapeHTML(world.intro)}</p></div><div class="hero-character">${mascotHTML(world.id)}</div></section>`;
}
export function footerHTML() {
  return `<footer class="arcade-footer"><a class="footer-brand" href="/">PLAYPILE</a><span>A little escape, one game at a time</span><nav aria-label="Site information"><a href="/settings/">Settings & info</a><a href="/site/contact.html">Contact</a><a href="/site/privacy.html">Privacy</a><a href="/site/terms.html">Terms</a><a href="/site/credits.html">Credits</a></nav><small>© 2026 PLAYPILE</small></footer>`;
}
export function headerHTML(active='') {
  return `<header class="top arcade-top"><div class="bar"><a class="logo" href="/" aria-label="PlayPile start screen">PLAY<b>PILE</b><span class="logo-pixel" aria-hidden="true"></span></a><nav class="arcade-nav" aria-label="Main menu"><a href="/browse/" ${active==='browse'?'aria-current="page"':''}>Browse games</a><a href="/me/" ${active==='me'?'aria-current="page"':''}>Profile</a><a href="/settings/" ${active==='settings'?'aria-current="page"':''}>Settings</a></nav><div id="accountSlot"></div></div></header>`;
}
export const searchHTML = () => `<form id="searchForm" class="arcade-search" role="search"><label for="q">Looking for something?</label><div><input id="q" type="search" placeholder="A game, a genre, a random word…" aria-label="Search games" autocomplete="off"><button type="submit" aria-label="Search">Find it →</button></div></form>`;
