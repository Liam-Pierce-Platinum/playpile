// Shared arcade navigation. Saved-game keys and public URLs remain stable.
import { GAMES } from './catalogue.js';
import { gameCardHTML, headerHTML } from './arcade-ui.js';
import { decorateCards } from './rating.js';
import './arcade-art.js';
export { GAMES };
export const catOf = g => g.cat || g.tag || 'Games';
export const svg = () => '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/></svg>';
export function categories(){const counts=new Map();for(const g of GAMES)counts.set(catOf(g),(counts.get(catOf(g))||0)+1);return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);}
export function search(q){const words=String(q||'').toLowerCase().split(/\s+/).filter(Boolean);return GAMES.filter(g=>{const text=[g.title,catOf(g),g.tag,...(g.tags||[]),g.blurb].join(' ').toLowerCase().split(/[^a-z0-9]+/);return words.every(w=>text.some(t=>t.startsWith(w)));});}
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
