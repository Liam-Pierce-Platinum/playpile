import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../site/catalogue.js';
import { GAME_COPY } from '../site/arcade-copy.js';
import { WORLDS } from '../site/arcade-data.js';
import { CHARACTER_ASSETS } from '../site/arcade-art.js';
import { playUrl } from '../site/seo.js';
import { gameCardHTML,escapeHTML } from '../site/arcade-ui.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFile(path.join(root,p),'utf8');

test('all twelve category animation atlases exist and new sheets contain six complete frames',async()=>{
 assert.equal(Object.keys(CHARACTER_ASSETS).length,12);
 for(const [kind,asset] of Object.entries(CHARACTER_ASSETS)){
  const bytes=await fs.readFile(path.join(root,asset.path.slice(1)));
  if(asset.path.endsWith('.png')){assert.equal(bytes.readUInt32BE(16),asset.width*6,kind);assert.equal(bytes.readUInt32BE(20),128,kind);assert.equal(bytes[25],6,kind+' must preserve RGBA transparency');}
 }
});
test('every current game remains available with real source, a thumbnail, crawlable text and controls',async()=>{
 assert.equal(GAMES.length,101);assert.deepEqual(Object.keys(GAME_COPY).sort(),GAMES.map(g=>g.slug).sort());
 for(const g of GAMES){const html=await read(playUrl(g).slice(1)+'index.html');assert.ok(html.includes(escapeHTML(g.blurb)),g.slug+' missing static copy');assert.ok(html.includes('id="frame"'),g.slug+' missing game frame');assert.ok(html.includes('window.__PLAYPILE_WEB=1'),g.slug+' not a hosted game');assert.ok(html.includes('id="keys"'));await fs.access(path.join(root,'shots/t/'+g.slug+'.webp'));await fs.access(path.join(root,'games',(g.web||g.slug).split('?')[0],'index.html'));}
});
test('home and Browse show all games once, with an automatic intro only on home',async()=>{
 const expected=GAMES.map(g=>g.slug);
 for(const file of ['index.html','browse/index.html','browse/all/index.html']){
  const html=await read(file);
  assert.deepEqual([...html.matchAll(/data-slug="([^"]+)"/g)].map(m=>m[1]),expected,file);
  for(const href of ['/browse/','/category/','/me/','/settings/'])assert.ok(html.includes(`href="${href}"`));
  assert.equal(html.includes('id="arcadeBoot"'),file==='index.html');
  assert.ok(html.includes('type="search"'));
  assert.ok(!html.includes('class="start-menu"'));
 }
 const categories=await read('category/index.html');
 for(const world of WORLDS)assert.ok(categories.includes(`kind="${world.id}"`),world.id);
});
test('each browse category has a character and no duplicated game cards',async()=>{
 for(const world of WORLDS){const html=await read(world.href.slice(1)+'index.html');assert.ok(html.includes(`kind="${world.id}"`));const slugs=[...html.matchAll(/data-slug="([^"]+)"/g)].map(m=>m[1]);assert.ok(slugs.length>0);assert.equal(slugs.length,new Set(slugs).size,world.id);assert.ok(!html.includes('class="catlist"'));}
});
test('card text is escaped rather than being treated as markup',()=>{
 const card=gameCardHTML({...GAMES[0],title:'<img src=x onerror=alert(1)>',blurb:'<script>alert(1)</script>'});assert.ok(!card.includes('<script>'));assert.ok(card.includes('&lt;script&gt;'));
});
test('information pages do not access the absent recommendations element',async()=>{
 for(const p of ['articles/index.html','devlog/index.html','articles/games-that-play-well-on-a-phone/index.html'])assert.ok(!(await read(p)).includes("document.getElementById('picks').innerHTML"),p);
});
test('local save keys and avatar ids survive the redesign',async()=>{
 const avatar=await read('site/avatar.js'),progress=await read('site/progress.js'),shell=await read('site/arcade-shell.js');assert.ok(avatar.includes("localStorage.getItem('pd.site.avatar')"));assert.ok(avatar.includes("'g' + i"));for(const key of ['pd.site.stats','pd.site.badges','pd.site.daily','pd.site.favs'])assert.ok(progress.includes(key));assert.ok(shell.includes("localStorage.getItem('pd.recent')"));
});
test('Luke’s Diner wrapper instructions match the game help',()=>{
 const controls=Object.fromEntries(GAMES.find(g=>g.slug==='lukes-diner').controls);assert.match(controls['Q W E'],/tables/);assert.match(controls['A S D'],/stools/);
});

test('returning visitors load one version of the shell, catalogue and pixel avatar modules',async()=>{
 for(const page of ['index.html','browse/index.html','me/index.html','site/about.html','play/puck-blitz-air-hockey-game/index.html']){
  const html=await read(page),matches=[...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length,1,page);const map=JSON.parse(matches[0][1]).imports;
  const versions=['/site/shell.js','/site/catalogue.js','/site/avatar.js','/site/arcade-art.js','/site/arcade-profile.js','/ads/ads.js'].map(url=>{assert.ok(map[url]?.startsWith(url+'?v='),url);return map[url].split('?v=')[1];});
  assert.equal(new Set(versions).size,1,page);assert.ok(html.indexOf('type="importmap"')<html.indexOf('type="module"'),page);
 }
});
