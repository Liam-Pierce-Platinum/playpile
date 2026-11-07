import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../site/catalogue.js';
import { GAME_COPY } from '../site/arcade-copy.js';
import { WORLDS } from '../site/arcade-data.js';
import { playUrl } from '../site/seo.js';
import { gameCardHTML,escapeHTML } from '../site/arcade-ui.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFile(path.join(root,p),'utf8');
test('every current game remains available with real source, a thumbnail, crawlable text and controls',async()=>{
 assert.equal(GAMES.length,101);assert.deepEqual(Object.keys(GAME_COPY).sort(),GAMES.map(g=>g.slug).sort());
 for(const g of GAMES){const html=await read(playUrl(g).slice(1)+'index.html');assert.ok(html.includes(escapeHTML(g.blurb)),g.slug+' missing static copy');assert.ok(html.includes('id="frame"'),g.slug+' missing game frame');assert.ok(html.includes('window.__PLAYPILE_WEB=1'),g.slug+' not a hosted game');assert.ok(html.includes('id="keys"'));await fs.access(path.join(root,'shots/t/'+g.slug+'.webp'));await fs.access(path.join(root,'games',(g.web||g.slug).split('?')[0],'index.html'));}
});
test('start screen exposes three destinations and does not duplicate the game catalogue',async()=>{
 const html=await read('index.html');for(const href of ['/browse/','/me/','/settings/'])assert.ok(html.includes('href="'+href+'"'));assert.ok(!html.includes('data-slug='));assert.ok(!html.includes('ad-home-'));assert.ok(html.includes('/site/privacy.html'));
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
