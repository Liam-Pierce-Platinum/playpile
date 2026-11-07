import { GAMES } from './catalogue.js';
import { stats, totals, levelOf, earned, favs, daily, BADGES, fmtTime } from './progress.js';
import { avatarSvg, getAvatar, avatarFor } from './avatar.js';
import { gameCardHTML, escapeHTML as esc } from './arcade-ui.js';
import { pixelBadge } from './pixel-ui.js';
import { playUrl } from './seo.js';
const bySlug=s=>GAMES.find(g=>g.slug===s);
export function mountMe(el){
 const paint=()=>{
  const s=stats(),t=totals(s),level=levelOf(s.xp),got=earned(),quest=daily();
  const account=window.__playpileAccount?.who()||{mode:'guest',name:''},name=account.mode==='guest'?'Player one':account.name;
  let recent=[];try{recent=JSON.parse(localStorage.getItem('pd.recent')||'[]').map(bySlug).filter(Boolean);}catch{}
  const favorites=favs().map(bySlug).filter(Boolean);
  const section=(id,title,list,empty)=>`<section class="row" id="${id}"><div class="rowhead"><h2>${title}</h2></div>${list.length?`<div class="strip wide">${list.map(gameCardHTML).join('')}</div>`:`<p class="pp-empty">${empty}</p>`}</section>`;
  const tile=(v,label)=>`<div class="pp-tile"><b>${v}</b><small>${label}</small></div>`;
  el.innerHTML=`<div class="eyebrow">Your save screen</div><section class="pp-hero">${avatarSvg(getAvatar()||avatarFor(name),112)}<div class="pp-who"><h1>${esc(name)}</h1><span class="pp-pill">${account.mode==='cloud'?'Saved to your account':'Saved on this device'}</span><div class="pp-lvrow"><b>Level ${level.level}</b><span>${level.into} / ${level.need} XP to the next level</span></div><span class="pp-bar big"><i style="width:${level.pct}%"></i></span><div class="pp-acts"><button class="btn" id="ppEdit" type="button">${account.mode==='guest'?'Choose your name & look':'Change name & look'}</button></div></div></section>
  <nav class="profile-tabs" aria-label="Profile sections"><a href="#recent">Recently played</a><a href="#favorites">Favourites</a><a href="#quest">Daily quest</a><a href="#badges">Badge cabinet</a></nav>
  <div class="pp-tiles">${tile(s.xp.toLocaleString(),'total XP')}${tile(t.played,'games tried')}${tile(fmtTime(t.secs),'time played')}${tile(t.streak,'day streak')}${tile(quest.streak,'quest streak')}${tile(`${Object.keys(got).length} / ${BADGES.length}`,'badges')}</div>
  ${section('recent','Back for another round?',recent,'Your recently played games will land here. <a class="text-link" href="/browse/">Go find your first one →</a>')}
  ${section('favorites','The keepers',favorites,'Found a good one? Hit Add to favourites below the game and we’ll keep it here')}
  <section class="row" id="quest"><div class="rowhead"><h2>Your daily quest</h2></div>${quest.game?`<a class="pp-daily${quest.done?' done':''}" href="${playUrl(quest.game)}"><span class="pp-dshot"><span class="quest-medal">${pixelBadge(quest.done?'first':'daily1',90)}</span></span><span class="pp-dbody"><span class="pp-kick">${quest.done?'Quest cleared':'A little side mission'} · +50 XP</span><b class="pp-dtitle">${esc(quest.game.title)}</b><span class="pp-dgoal">${quest.done?'Nice work. A fresh quest turns up tomorrow':esc(quest.goal)}</span><span class="pp-bar"><i style="width:${quest.pct}%"></i></span><span class="pp-dfoot"><span class="pp-streak">${quest.streak?quest.streak+' days running':'Your streak starts here'}</span><span class="pp-go">${quest.done?'Play again':'Take the quest'} →</span></span></span></a>`:''}</section>
  <section class="row" id="badges"><div class="rowhead"><h2>Badge cabinet</h2><span>${Object.keys(got).length} / ${BADGES.length}</span></div><div class="pp-badges">${BADGES.map(b=>`<div class="pp-badge${got[b.id]?' on':''}"><span class="pp-bi">${pixelBadge(b.id)}</span><span><b>${esc(b.name)}</b><small>${esc(b.desc)}<br>${got[b.id]?'Unlocked '+esc(got[b.id]):b.xp?'Locked · +'+b.xp+' XP':'Locked'}</small></span></div>`).join('')}</div></section>
  <p class="pp-fine">Play to earn XP, try a daily quest and fill your badge cabinet. Progress stays in this browser. Moving devices? Grab a save code from your profile menu first</p>`;
  el.querySelector('#ppEdit').addEventListener('click',()=>window.__playpileAccount?.open());
 };
 paint();addEventListener('pp-account',paint);
}
