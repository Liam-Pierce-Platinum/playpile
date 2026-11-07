import { mountShell, search } from './shell.js';
import { gameCardHTML, escapeHTML as esc } from './arcade-ui.js';
import { GAMES } from './catalogue.js';
const still=()=>{try{return localStorage.getItem('pd.ui.motion')==='reduced';}catch{return false;}};
document.documentElement.classList.toggle('arcade-still',still());
const page=document.body.dataset.arcadePage;
if(page==='start'){
 const old=new URLSearchParams(location.hash.slice(1));
 if(old.has('q'))location.replace('/browse/?q='+encodeURIComponent(old.get('q')));
 else if(old.get('r')==='recent')location.replace('/me/#recent');
 else if(old.has('r'))location.replace(({new:'/browse/new/',just:'/browse/new/',popular:'/browse/popular/',friends:'/free-multiplayer-games/',all:'/browse/all/'})[old.get('r')]||'/browse/all/');
 else if(old.has('c')){const {catUrl}=await import('./seo.js');location.replace(catUrl(old.get('c')));}
 for(const link of document.querySelectorAll('.start-menu a'))link.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||still()||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  event.preventDefault();document.body.classList.add('launching');setTimeout(()=>location.assign(link.href),430);
 });
 addEventListener('pageshow',()=>document.body.classList.remove('launching'));
}else if(page){
 const results=document.getElementById('browseResults'),categories=document.getElementById('worlds');
 const renderSearch=value=>{
  if(!results)return;
  const term=value.trim(),hits=term?search(term):[];
  const url=new URL(location.href);term?url.searchParams.set('q',term):url.searchParams.delete('q');history.replaceState(null,'',url);
  if(categories)categories.hidden=!!term;
  results.hidden=!term;
  if(term){results.innerHTML=`<div class="rowhead"><h2>${hits.length?'Found '+hits.length+' for':'No luck with'} “${esc(term)}”</h2><button type="button" class="btn ghost" id="clearSearch">Clear search</button></div>${hits.length?`<div class="game-grid">${hits.map(gameCardHTML).join('')}</div>`:'<div class="empty-state"><p>Try a shorter name or a genre like puzzle, driving or arcade</p></div>'}`;document.getElementById('clearSearch').onclick=()=>{document.getElementById('q').value='';renderSearch('');document.getElementById('q').focus();};}
 };
 mountShell({active:page==='profile'?'me':page==='settings'?'settings':'browse',onSearch:results?renderSearch:null});
 if(results){const input=document.getElementById('q');const term=new URLSearchParams(location.search).get('q')||'';input.value=term;renderSearch(term);let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>renderSearch(input.value),150);});}
}
const motionToggle=document.getElementById('reduceMotion');
if(motionToggle){motionToggle.checked=still();motionToggle.addEventListener('change',()=>{try{localStorage.setItem('pd.ui.motion',motionToggle.checked?'reduced':'full');}catch{}document.documentElement.classList.toggle('arcade-still',motionToggle.checked);dispatchEvent(new Event('pp-motion'));});}
