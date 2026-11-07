// Build the static arcade pages without changing game code or save storage.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GAMES } from '../site/catalogue.js';
import { WORLDS, worldFor, newest, featured } from '../site/arcade-data.js';
import { headerHTML, footerHTML, searchHTML, worldCardHTML, worldHeroHTML, gameCardHTML, mascotHTML, escapeHTML as esc } from '../site/arcade-ui.js';
import { friendsList } from '../site/multiplayer.js';
import { gameHead, aboutHtml, keysHtml, tagsHtml, crumbsHtml, related, miniHtml, playUrl } from '../site/pages.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=createHash('sha256').update(await fs.readFile(path.join(root,'site/arcade.css'))).update(await fs.readFile(path.join(root,'site/account.js'))).digest('hex').slice(0,8);
const read=p=>fs.readFile(path.join(root,p),'utf8');
const write=async(p,s)=>{if(p.endsWith('.html'))s=s.replace(/(href|src)="(\/site\/(?:arcade[^"?]*\.(?:js|css)|account\.js))(?:\?[^\"]*)?"/g,(_,attr,url)=>`${attr}="${url}?v=${release}"`).replace(/\r\n?/g,'\n').replace(/[\t ]+$/gm,'');await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),s);};
const styles='<link rel="stylesheet" href="/site/arcade-characters.css">\n<link rel="stylesheet" href="/site/arcade.css">';
const client='<script type="module" src="/site/arcade-client.js"></script>';
const head=(title,description,url)=>`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — PLAYPILE</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="https://playpile.net${url}"><meta property="og:title" content="${esc(title)} — PLAYPILE"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://playpile.net/site/icon-512.png"><meta name="theme-color" content="#152b2c"><link rel="icon" href="/site/icon.svg" type="image/svg+xml"><link rel="manifest" href="/site/manifest.webmanifest"><link rel="stylesheet" href="/site/style.css"><link rel="stylesheet" href="/site/account.css"><link rel="stylesheet" href="/site/progress.css">${styles}<script>window.__PLAYPILE_WEB=1;</script><script type="module" src="/site/account.js"></script>`;
const page=(title,desc,url,content,mode='browse',extra='')=>`<!doctype html><html lang="en"><head>${head(title,desc,url)}${extra}</head><body class="arcade-site" data-arcade-page="${mode}"><a class="skip" href="#main">Skip to content</a>${headerHTML(mode==='profile'?'me':mode==='settings'?'settings':'browse')}<main id="main" class="arcade-main">${content}${footerHTML()}</main>${client}</body></html>`;
const members=w=>w.id==='new'?newest(GAMES):w.id==='popular'?featured(GAMES):w.id==='friends'?friendsList(GAMES):GAMES.filter(g=>g.cat===w.cat);

// Start screen: three useful choices, no duplicated game shelves.
await write('index.html',`<!doctype html><html lang="en"><head>${head('Your next one more go','Free browser games in a little retro arcade. Browse the categories, find a game and jump in.','/')}<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3389918233377914" crossorigin="anonymous"></script></head><body class="arcade-site arcade-start" data-arcade-page="start"><a class="skip" href="#startMenu">Skip to the menu</a><main class="desk" id="main"><div class="computer"><div class="monitor"><div class="screen-well"><div class="computer-screen"><div class="screen-stars" aria-hidden="true"></div><span class="boot-label">PLAYPILE / READY TO PLAY</span><h1 class="start-title">PLAYPILE</h1><p class="start-tagline">Got time for one more go?</p><nav class="start-menu" id="startMenu" aria-label="Start menu"><a href="/browse/"><span class="menu-symbol" aria-hidden="true">▶</span>Browse games</a><a href="/me/"><span class="menu-symbol" aria-hidden="true">♟</span>Profile</a><a href="/settings/"><span class="menu-symbol" aria-hidden="true">✚</span>Settings</a></nav><p class="start-count">${GAMES.length} games · no downloads · just play</p><span class="screen-corner">${mascotHTML('arcade')}</span></div></div><div class="monitor-chin"><b>PLAYPILE</b><small>HOME ARCADE</small><span class="power-light" aria-hidden="true"></span><span class="power-switch" aria-hidden="true"></span></div></div><div class="monitor-neck" aria-hidden="true"></div><div class="monitor-foot" aria-hidden="true"></div><div class="keyboard" aria-hidden="true">${'<i></i>'.repeat(33)}</div></div></main>${footerHTML()}${client}</body></html>`);

await write('browse/index.html',page('Pick your next adventure','Pick a category and find your next browser game. Racing, puzzles, sport, multiplayer and more.','/browse/',`<div class="browse-heading"><div><div class="eyebrow">Choose your next stop</div><h1>What are we playing?</h1><p>Pick a character. Find your kind of game</p></div>${searchHTML()}</div><section class="world-grid" id="worlds" aria-label="Game categories">${WORLDS.map(w=>worldCardHTML(w,members(w).length)).join('')}</section><section id="browseResults" aria-live="polite" aria-label="Search results" hidden></section><div class="browse-tools"><span>Take your time. There’s a whole pile to get through</span><a class="text-link" href="/browse/all/">Show me every game →</a></div>`));

for(const world of WORLDS){
 const games=members(world);
 let info='';
 if(world.id==='friends') info='<p class="category-note">Look for <b>Play online</b> to join from different devices. Car Soccer, Tank Duel and Getaway Flop share one screen. The controls below each game show you how</p>';
 await write(world.href.slice(1)+'index.html',page(world.name+' games',world.intro,world.href,worldHeroHTML(world,games.length)+info+`<div class="game-grid">${games.map(gameCardHTML).join('')}</div>`));
}
await write('browse/all/index.html',page('The whole pile','Every game on PlayPile, together in one place.','/browse/all/',`<div class="browse-heading"><div><a class="backlink" href="/browse/">← Pick a category</a><h1>The whole pile</h1><p>${GAMES.length} games. Yours to get lost in</p></div>${searchHTML()}</div><div class="game-grid" id="worlds">${GAMES.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(gameCardHTML).join('')}</div><section id="browseResults" aria-live="polite" aria-label="Search results" hidden></section>`));

const infoPages=[['01','About','The person and the idea behind the pile','/site/about.html'],['02','Updates','What’s new, what’s fixed and what changed','/site/updates.html'],['03','Dev log','A peek under the hood','/devlog/'],['04','My picks','A few good places to start','/articles/'],['05','Contact','Found a bug? Got an idea? Say hello','/site/contact.html'],['06','Privacy & saves','Your saved games and your choices','/site/settings.html']];
await write('settings/index.html',page('Settings & info','Display options, site information and a way to get in touch.','/settings/',`<a class="backlink" href="/">← Back to the computer</a><div class="eyebrow">The useful stuff</div><h1>Settings & info</h1><p>Need something outside the games? You’re in the right place</p><section class="display-options"><h2>Make yourself comfortable</h2><label><input type="checkbox" id="reduceMotion">Keep the characters still and skip the zoom</label><p class="pp-fine">Your device’s reduced-motion setting is respected too</p></section><section class="settings-grid" aria-label="Site pages">${infoPages.map(([n,title,desc,href])=>`<a class="settings-card" href="${href}"><span>${n} / OPEN FILE</span><strong>${title} →</strong><p>${desc}</p></a>`).join('')}</section><h2>A few more things</h2><nav class="settings-secondary" aria-label="Policies and support"><a href="/site/parents.html">For parents</a><a href="/site/privacy.html">Privacy policy</a><a href="/site/cookies.html">Cookies</a><a href="/site/terms.html">Terms</a><a href="/site/accessibility.html">Accessibility</a><a href="/site/credits.html">Credits</a><a href="/site/advertise.html">Advertising</a></nav>`,'settings'));
await write('me/index.html',page('Your save screen','Your profile, recently played games, favourites, daily quest and badges.','/me/','<div id="me" class="pp-me"><noscript>Your profile needs JavaScript to read your saved progress from this browser.</noscript></div><script type="module">import { mountMe } from "/site/arcade-profile.js";mountMe(document.getElementById("me"));</script>','profile','<meta name="robots" content="noindex">'));

function theme(html,active='browse'){
 if(!html.includes('/site/arcade.css'))html=html.replace('</head>',styles+'\n</head>');
 if(!html.includes('/site/arcade-client.js'))html=html.replace('</body>',client+'\n</body>');
 html=html.replace(/<body([^>]*)>/,(_,attributes)=>attributes.includes('arcade-site')?'<body'+attributes+'>':attributes.includes('class=')?'<body'+attributes.replace(/class="([^"]*)"/,'class="$1 arcade-site"')+'>':'<body class="arcade-site"'+attributes+'>');
 html=html.replace(/<header class="top[^>]*>[\s\S]*?<\/header>/,headerHTML(active));
 html=html.replace(/<aside class="sidenav"[\s\S]*?<\/aside>/,'').replace(/<div class="scrim"[^>]*><\/div>/,'');
 html=html.replace(/<footer class="foot">[\s\S]*?<\/footer>/,footerHTML());
 html=html.replace(/document\.getElementById\('picks'\)\.innerHTML\s*=\s*row\([\s\S]*?\);/g,'// Optional recommendations removed: the page already has its own content.');
 html=html.replaceAll('More from the my picks','More picks').replaceAll('More from the articles','More picks');
 html=html.replace(/100 browser games/g,GAMES.length+' browser games');
 html=html.replaceAll('>All games</a>','>Browse games</a>').replaceAll('href="/">Browse games','href="/browse/">Browse games');
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
for(const url of ['/browse/','/browse/all/','/browse/new/','/browse/popular/','/settings/'])if(!sitemap.includes('https://playpile.net'+url+'<'))sitemap=sitemap.replace('</urlset>',`<url><loc>https://playpile.net${url}</loc></url>\n</urlset>`);
await write('sitemap.xml',sitemap);
console.log(`Built start screen, 12 category screens, profile, settings, ${GAMES.length} game pages and shared information layouts`);
