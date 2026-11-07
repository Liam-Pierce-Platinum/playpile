// Shared arcade navigation. Saved-game keys and public URLs remain stable.
import { GAMES } from './catalogue.js';
import { gameCardHTML, headerHTML } from './arcade-ui.js';
import { friendsList, isOnline } from './multiplayer.js';
import { decorateCards } from './rating.js';
import { kwOf } from './seo.js';
import './arcade-art.js';
export { GAMES };
export const catOf = g => g.cat || g.tag || 'Games';
export const svg = () => '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/></svg>';
export function categories(){const counts=new Map();for(const g of GAMES)counts.set(catOf(g),(counts.get(catOf(g))||0)+1);return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);}

// Style descriptions confirmed in the game source or catalogue copy.
const extraStyles = {
  'auto-arena': 'watercolour',
  crossing: 'pixel art',
  highrise: 'PS1 low poly retro',
  kickback: 'pixel art',
};
const friendSlugs = new Set(friendsList(GAMES).map(game => game.slug));
const searchAliases = [
  [/\b(?:pixel ?art|pixelated|pixels)\b/g, 'pixel'],
  [/\blow ?poly(?:gon)?\b/g, 'lowpoly'],
  [/\b(?:ps ?1|psx|playstation (?:one|1))\b/g, 'ps1'],
  [/\b(?:n ?64|nintendo 64)\b/g, 'n64'],
  [/\b(?:3 d|three dimensional)\b/g, '3d'],
  [/\b(?:2 d|two dimensional)\b/g, '2d'],
  [/\bwater ?colou?r\b/g, 'watercolour'],
  [/\bclaymation\b/g, 'clay'],
  [/\b(?:racing|driving|racers?|races?)\b/g, 'racing'],
  [/\b(?:shooting|shooters)\b/g, 'shooter'],
  [/\bfirst person shooters?\b/g, 'fps'],
  [/\b(arcade|adventure|puzzle|sport)s\b/g, '$1'],
  [/\b(?:play with friends|multi player|(?:2|two) players?)\b/g, 'multiplayer'],
  [/\bco op\b/g, 'coop'],
  [/\bcozy\b/g, 'cosy'],
];
const fillerWords = new Set(['game', 'games', 'graphics', 'style', 'styled']);

function normalizeSearch(value) {
  let text = String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (const [pattern, replacement] of searchAliases) text = text.replace(pattern, replacement);
  return text;
}

function searchWords(text) {
  return text ? text.split(' ') : [];
}

function indexGame(game) {
  const title = normalizeSearch(game.title);
  const fields = [
    game.slug, catOf(game), game.tag, ...(game.tags || []), kwOf(game), game.blurb,
    extraStyles[game.slug], friendSlugs.has(game.slug) && 'multiplayer',
    isOnline(game.slug) && 'online',
  ].filter(Boolean);
  const words = new Set([title, ...fields.map(normalizeSearch)].flatMap(searchWords));
  return { game, title, titleWords: searchWords(title), words: [...words] };
}

let searchIndex;
export function search(query) {
  const term = normalizeSearch(query);
  const words = searchWords(term).filter(word => !fillerWords.has(word));
  if (!words.length) return GAMES.slice();

  const exact = [];
  const titles = [];
  const keywords = [];
  searchIndex ??= GAMES.map(indexGame);
  for (const entry of searchIndex) {
    if (entry.title === term) exact.push(entry.game);
    else if (words.every(word => entry.titleWords.some(token => token.startsWith(word)))) titles.push(entry.game);
    else if (words.every(word => entry.words.some(token => token.startsWith(word)))) keywords.push(entry.game);
  }
  return [...exact, ...titles, ...keywords];
}
export function recent(){try{return JSON.parse(localStorage.getItem('pd.recent')||'[]').map(s=>GAMES.find(g=>g.slug===s)).filter(Boolean);}catch{return [];}}
export function remember(slug){try{const saved=JSON.parse(localStorage.getItem('pd.recent')||'[]').filter(s=>s!==slug);localStorage.setItem('pd.recent',JSON.stringify([slug,...saved].slice(0,12)));}catch{}}
export const card = gameCardHTML;
export const tile = gameCardHTML;
export function row(heading,list,opts={}){if(!list.length)return '';const shown=opts.wide?list:list.slice(0,6);return `<section class="row"${opts.id?` id="${opts.id}"`:''}><div class="rowhead"><h2>${heading}</h2>${opts.seeAll?`<a class="seeall" href="${opts.seeAll}">See all →</a>`:''}</div><div class="strip wide">${shown.map(card).join('')}</div></section>`;}
export function mountShell({active='',onSearch=null}={}){
  document.body.classList.add('arcade-site');
  const top=document.querySelector('header.top');
  if(top&&!top.classList.contains('arcade-top')){
    const account=document.getElementById('accountSlot'),template=document.createElement('template');
    template.innerHTML=headerHTML(active==='me'?'me':['about','updates','devlog','articles','contact','settings'].includes(active)?'settings':'browse');
    const next=template.content.firstElementChild;
    if(account)next.querySelector('#accountSlot').replaceWith(account);
    top.replaceWith(next);
  }
  document.getElementById('sidenav')?.remove();document.getElementById('scrim')?.remove();
  const form=document.getElementById('searchForm'),input=document.getElementById('q');
  if(form&&input)form.addEventListener('submit',e=>{e.preventDefault();if(onSearch)onSearch(input.value);else location.href='/browse/?q='+encodeURIComponent(input.value.trim());});
  decorateCards();
  let queued=false;
  new MutationObserver(records=>{if(!queued&&records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.card')||n.querySelector?.('.card'))))){queued=true;requestAnimationFrame(()=>{queued=false;decorateCards();});}}).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
}
