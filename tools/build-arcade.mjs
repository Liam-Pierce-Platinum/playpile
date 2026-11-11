// Build the static arcade pages without changing game code or save storage.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GAMES } from '../site/catalogue.js';
import { WORLDS, newest, featured } from '../site/arcade-data.js';
import { headerHTML, footerHTML, searchHTML, worldCardHTML, worldHeroHTML, gameCardHTML, escapeHTML as esc } from '../site/arcade-ui.js';
import { friendsList } from '../site/multiplayer.js';
import { gameHead, aboutHtml, keysHtml, tagsHtml, crumbsHtml, related, miniHtml, playUrl } from '../site/pages.js';
import { CAT_SEO, OLD_SEO, catUrl } from '../site/seo.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteFiles=await fs.readdir(path.join(root,'site'));
const modulePaths=siteFiles.filter(file=>file.endsWith('.js')).sort().map(file=>'/site/'+file).concat('/ads/ads.js');
const arcadeStyles=siteFiles.filter(file=>/^arcade.*\.css$/.test(file)).sort().map(file=>'/site/'+file);
const releaseHash=createHash('sha256');
for(const file of [...modulePaths,...arcadeStyles])releaseHash.update(await fs.readFile(path.join(root,file.slice(1))));
const release=releaseHash.digest('hex').slice(0,8);
// One version for the whole module graph. A returning visitor must not mix a
// cached portal shell/avatar/catalogue with the new arcade entry points.
const importMap='<script type="importmap">'+JSON.stringify({imports:Object.fromEntries(modulePaths.map(url=>[url,url+'?v='+release]))})+'</script>';
const read=p=>fs.readFile(path.join(root,p),'utf8');
const canonicalLinks=new Map(Object.keys(CAT_SEO).map(category=>[`/category/${category.toLowerCase()}/`,catUrl(category)]));
for(const game of GAMES){
 const canonical=playUrl(game);
 canonicalLinks.set(`/play/${game.slug}/`,canonical);
 const oldSlug=OLD_SEO[game.slug];
 if(oldSlug)canonicalLinks.set(`/play/${oldSlug}/`,canonical);
}
const write=async(p,s)=>{
 if(p.endsWith('.html')){
  s=s.replace(/(<a\b[^>]*?\s+href\s*=\s*["'])(\/(?:play|category)\/[a-z0-9-]+\/)(?=["'?#])/gi,
    (_,start,url)=>start+(canonicalLinks.get(url)??url));
  s=s.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/g,'').replace('<head>','<head>'+importMap)
    .replace(/(href|src)="(\/site\/(?:arcade[^"?]*\.(?:js|css)|account\.js))(?:\?[^\"]*)?"/g,(_,attr,url)=>`${attr}="${url}?v=${release}"`)
    .replace(/\r\n?/g,'\n').replace(/[\t ]+$/gm,'');
 }
 await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});
 await fs.writeFile(path.join(root,p),s);
};
const extraStyles='<link rel="stylesheet" href="/site/arcade-return.css">\n<link rel="stylesheet" href="/site/arcade-locale.css">';
const styles='<link rel="stylesheet" href="/site/arcade-characters.css">\n<link rel="stylesheet" href="/site/arcade.css">\n'+extraStyles;
const client='<script type="module" src="/site/arcade-client.js"></script>';
const head=(title,description,url)=>`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — PLAYPILE</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="https://playpile.net${url}"><meta property="og:title" content="${esc(title)} — PLAYPILE"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://playpile.net/site/icon-512.png"><meta name="theme-color" content="#152b2c"><link rel="icon" href="/site/icon.svg" type="image/svg+xml"><link rel="manifest" href="/site/manifest.webmanifest"><link rel="stylesheet" href="/site/style.css"><link rel="stylesheet" href="/site/account.css"><link rel="stylesheet" href="/site/progress.css">${styles}<script>window.__PLAYPILE_WEB=1;</script><script type="module" src="/site/account.js"></script>`;
const page=(title,desc,url,content,mode='browse',extra='',intro='')=>`<!doctype html><html lang="en"><head>${head(title,desc,url)}${extra}</head><body class="arcade-site" data-arcade-page="${mode}"><a class="skip" href="#main">Skip to content</a>${intro}${headerHTML(mode==='profile'?'me':mode)}<main id="main" class="arcade-main">${content}${footerHTML()}</main>${client}</body></html>`;
const members=w=>w.id==='new'?newest(GAMES):w.id==='popular'?featured(GAMES):w.id==='friends'?friendsList(GAMES):GAMES.filter(g=>g.cat===w.cat);

// The intro is a visual layer over the already rendered catalogue. It plays once per tab.
const boot=`<div class="arcade-boot" id="arcadeBoot" aria-hidden="true" hidden><div class="computer"><div class="monitor"><div class="screen-well"><div class="computer-screen"><span class="boot-label">HOME ARCADE</span><span class="start-title">PLAYPILE</span></div></div><div class="monitor-chin"><b>PLAYPILE</b><small>HOME ARCADE</small><span class="power-light"></span><span class="power-switch"></span></div></div><div class="monitor-neck"></div><div class="monitor-foot"></div><div class="keyboard">${'<i></i>'.repeat(33)}</div></div></div>
<script>
  if (!location.search && !location.hash && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      if (localStorage.getItem('pd.ui.motion') !== 'reduced' && !sessionStorage.getItem('pd.ui.booted')) {
        sessionStorage.setItem('pd.ui.booted', '1');
        document.getElementById('arcadeBoot').hidden = false;
      }
    } catch {}
  }
</script>`;
const catalogue=`<div id="returnShelf"></div><div class="browse-heading feed-heading"><div><h1>Browse Games</h1><p>Find something fun and jump in.</p></div>${searchHTML()}</div>
<section aria-label="Game library"><div class="feed-status"><p id="gameCount" role="status">${GAMES.length} games</p><button class="feed-clear" id="clearSearch" type="button" hidden>Clear search</button></div>
<div class="game-grid game-feed" id="gameFeed">${GAMES.map(game=>gameCardHTML(game,{compact:true})).join('')}</div>
<p class="empty-state" id="searchEmpty" hidden>Try a different title, genre or art style.</p></section>`;
const browseTitle='Browse free games';
const browseDesc='Browse and play free browser games on PlayPile. Find games by name, genre or art style.';
const ads='<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3389918233377914" crossorigin="anonymous"></script>';
await write('index.html',page(browseTitle,browseDesc,'/',catalogue,'browse',ads,boot));
await write('browse/index.html',page(browseTitle,browseDesc,'/',catalogue));
await write('browse/all/index.html',page(browseTitle,browseDesc,'/',catalogue));
await write('category/index.html',page('Game categories','Find games by category, from racing and puzzles to multiplayer.','/category/',`<div class="browse-heading"><div><h1>Categories</h1><p>Pick a character. Find your kind of game.</p></div><a class="backlink" href="/browse/">Browse all games →</a></div><section class="world-grid" aria-label="Game categories">${WORLDS.map(w=>worldCardHTML(w,members(w).length)).join('')}</section>`,'categories'));

for(const world of WORLDS){
 const games=members(world);
 let info='';
 if(world.id==='friends') info='<p class="category-note">Look for <b>Play online</b> to join from different devices. Same-screen games may use touch, a keyboard or controllers. Check the controls below each game.</p>';
 await write(world.href.slice(1)+'index.html',page(world.name+' games',world.intro,world.href,worldHeroHTML(world,games.length)+info+`<div class="game-grid">${games.map(gameCardHTML).join('')}</div>`,'categories'));
}

const infoPages=[['01','About','The person and the idea behind the pile','/site/about.html'],['02','Updates','What’s new, what’s fixed and what changed','/site/updates.html'],['03','Dev log','A peek under the hood','/devlog/'],['04','My picks','A few good places to start','/articles/'],['05','Contact','Found a bug? Got an idea? Say hello','/site/contact.html'],['06','Privacy & saves','Your saved games and your choices','/site/settings.html']];
await write('settings/index.html',page('Settings & info','Display options, site information and a way to get in touch.','/settings/',`<a class="backlink" href="/">← Back to the computer</a><div class="eyebrow">The useful stuff</div><h1>Settings & info</h1><p>Need something outside the games? You’re in the right place</p><section class="display-options"><h2>Make yourself comfortable</h2><label><input type="checkbox" id="reduceMotion">Keep the characters still and skip the zoom</label><p class="pp-fine">Your device’s reduced-motion setting is respected too</p></section><section class="settings-grid" aria-label="Site pages">${infoPages.map(([n,title,desc,href])=>`<a class="settings-card" href="${href}"><span>${n} / OPEN FILE</span><strong>${title} →</strong><p>${desc}</p></a>`).join('')}</section><h2>A few more things</h2><nav class="settings-secondary" aria-label="Policies and support"><a href="/site/parents.html">For parents</a><a href="/site/privacy.html">Privacy policy</a><a href="/site/cookies.html">Cookies</a><a href="/site/terms.html">Terms</a><a href="/site/accessibility.html">Accessibility</a><a href="/site/credits.html">Credits</a><a href="/site/advertise.html">Advertising</a></nav>`,'settings'));
await write('me/index.html',page('Your save screen','Your profile, daily quest, progress and badges.','/me/','<div id="me" class="pp-me"><noscript>Your profile needs JavaScript to read your saved progress from this browser.</noscript></div><script type="module">import { mountMe } from "/site/arcade-profile.js";mountMe(document.getElementById("me"));</script>','profile','<meta name="robots" content="noindex">'));

function theme(html,active='browse'){
 if(!html.includes('/site/arcade.css'))html=html.replace('</head>',styles+'\n</head>');
 else if(!html.includes('/site/arcade-locale.css'))html=html.replace('</head>',extraStyles+'\n</head>');
 if(!html.includes('/site/arcade-client.js'))html=html.replace('</body>',client+'\n</body>');
 html=html.replace(/<body([^>]*)>/,(_,attributes)=>attributes.includes('arcade-site')?'<body'+attributes+'>':attributes.includes('class=')?'<body'+attributes.replace(/class="([^"]*)"/,'class="$1 arcade-site"')+'>':'<body class="arcade-site"'+attributes+'>');
 html=html.replace(/<header class="top[^>]*>[\s\S]*?<\/header>/,headerHTML(active));
 html=html.replace(/<aside class="sidenav"[\s\S]*?<\/aside>/,'').replace(/<div class="scrim"[^>]*><\/div>/,'');
 html=html.replace(/<footer class="foot">[\s\S]*?<\/footer>/,footerHTML());
 html=html.replace(/document\.getElementById\('picks'\)\.innerHTML\s*=\s*row\([\s\S]*?\);/g,'// Optional recommendations removed: the page already has its own content.');
 html=html.replaceAll('More from the my picks','More picks').replaceAll('More from the articles','More picks');
 html=html.replace(/100 browser games/g,GAMES.length+' browser games');
 html=html.replaceAll('>All games</a>','>Browse Games</a>').replaceAll('>Browse games</a>','>Browse Games</a>').replaceAll('href="/">Browse Games','href="/browse/">Browse Games');
 return html;
}

// Shared game wrapper. Existing route aliases and game files are untouched.
let template=await read('site/play.html');
template=theme(template);
template=template.replaceAll("row('More ' + catOf(g) + ' games', same,", "row('More ' + catOf(g) + ' games', same.slice(0, 4),")
 .replaceAll("rest.slice(0, 12)","rest.slice(0, 4)")
 .replaceAll("note = 'runs here';","note = '';");
template=template.replace("const ro = new ResizeObserver(adSpacing);\nro.observe(document.querySelector('.stage')); ro.observe(document.querySelector('.side .panel'));","const ro = new ResizeObserver(adSpacing);\nro.observe(document.querySelector('.stage'));\nconst sidePanel=document.querySelector('.side .panel'); if(sidePanel) ro.observe(sidePanel);");
if(!template.includes('window.__PLAYPILE_WEB=1'))template=template.replace('<head>','<head>\n<script>window.__PLAYPILE_WEB=1;</script>');
await write('site/play.html',template);
for(const game of GAMES){
 const guide=await read('site/guides/'+game.slug+'.html').catch(()=> '');
 const fields={head:gameHead(game),title:esc(game.title),blurb:esc(game.blurb),about:aboutHtml(game),keys:keysHtml(game),tip:esc(game.tips),tags:tagsHtml(game),crumbs:crumbsHtml(game),guide,more:related(game,GAMES).map(miniHtml).join('')};
 let html=template.replace(/<!--PRE:(\w+)-->[\s\S]*?<!--\/PRE:\1-->/g,(_,key)=>fields[key]||'');
 await write(playUrl(game).slice(1)+'index.html',html);
}

async function walk(dir){let files=[];for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=path.posix.join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(p));else if(entry.name.endsWith('.html'))files.push(p);}return files;}
for(const dir of ['articles','devlog','site'])for(const file of await walk(dir)){
 if(file.startsWith('site/guides/')||file==='site/play.html')continue;
 let html=await read(file);if(!html.includes('<html'))continue;
 html=theme(html,'settings');
 if(!html.includes('arcade-info-back')&&/class="prose"/.test(html))html=html.replace('<div class="prose">','<a class="arcade-info-back" href="/settings/">← Settings & info</a>\n<div class="prose">');
 if(file==='site/me.html')html=html.replace("from '/site/progress.js'","from '/site/arcade-profile.js'");
 await write(file,html);
}

// A simple, factual introduction rather than a catalogue repeated as a biography.
let about=await read('site/about.html');
about=about.replace(/<section class="hero">[\s\S]*?<div id="picks"><\/div>/,`<section class="hero"><h1>Hey, welcome to PlayPile</h1><p>A home for games you can open in a browser and get straight into</p></section><h2>A pile of ideas that became games</h2><p>PlayPile is Liam’s collection of browser games. Some are quick little score chasers. Others have whole worlds to explore. The fun is finding something you didn’t know you wanted to play.</p><p>Start with a category, follow a character or just <a class="text-link" href="/browse/all/">look through the whole pile</a>. You don’t need an account to play.</p><h2>Your progress stays with you</h2><p>Scores and profiles are saved in this browser. If you move to another device, use a save code from your profile menu. Clearing the browser’s saved data can clear your progress too.</p><h2>Stuck on something?</h2><p>Each game has controls and a guide underneath it. There’s a report link there too. If a game gets stuck or an instruction makes no sense, let us know which game and what happened.</p><h2>Still growing</h2><p>The <a class="text-link" href="/site/updates.html">updates page</a> keeps track of additions and fixes. The <a class="text-link" href="/devlog/">dev log</a> looks at how parts of the games work.</p><h2>Say hello</h2><p>Ideas, bug reports and the occasional very good score are welcome at <a class="text-link" href="mailto:support@playpile.net">support@playpile.net</a></p>`);
await write('site/about.html',about);

// Keep the newer destinations discoverable without duplicating every game on Home.
let sitemap=await read('sitemap.xml');
for(const url of ['/browse/','/browse/all/'])sitemap=sitemap.replace(`<url><loc>https://playpile.net${url}</loc></url>\n`,'');
for(const url of ['/category/','/browse/new/','/browse/popular/','/settings/'])if(!sitemap.includes('https://playpile.net'+url+'<'))sitemap=sitemap.replace('</urlset>',`<url><loc>https://playpile.net${url}</loc></url>\n</urlset>`);
await write('sitemap.xml',sitemap);
console.log(`Built the catalogue and boot intro, 12 category screens, profile, settings, ${GAMES.length} game pages and shared information layouts`);
