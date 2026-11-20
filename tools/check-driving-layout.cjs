// Requires Playwright and a browser. From the repository root, run
// node tools/check-driving-layout.cjs [--live] [--webkit] [--2d] [--desktop] [--standalone] [--game=slug].
// Set HUD_CAPTURES to a directory to save landscape screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const games = [
  { slug: 'harbor-rush', route: 'harbor-rush-courier-driving-game', start: '#start', menu: '#pauseButton', panel: '#overlay', speed: '#speedValue' },
  { slug: 'neon-repo', route: 'neon-repo-vehicle-recovery-game', start: '#jobs button', menu: '#pause', panel: '#pausepanel', speed: '#speed' },
  { slug: 'skyline-stunt-club', route: 'skyline-stunt-club-rooftop-driving-game', start: '#start', menu: '#pause', panel: '#pausePanel', speed: '#speed' },
];
const flags = new Set(process.argv.slice(2));
const onlyGame = [...flags].find(arg => arg.startsWith('--game='))?.slice(7);
const desktop = flags.has('--desktop');
const sizes = desktop ? [[1366, 768], [1024, 768]] :
  [[864, 515], [740, 360], [568, 320], [320, 568], [390, 844], [820, 1180], [1050, 690], [864, 515]];
const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.svg':'image/svg+xml', '.png':'image/png', '.ttf':'font/ttf', '.glb':'model/gltf-binary' };

function serve() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
}

// A transparent or pointer-events:none map can cover a pedal and still pass
// elementFromPoint. Check its actual painted box as well as button hit targets.
function auditDriving(touch) {
  function occupied(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return Boolean(el.getBoundingClientRect().width && el.getBoundingClientRect().height);
  }
  const nodes = [...document.querySelectorAll('[data-drive-readout],button,select,#map3d,#miniMap,#radar,#routeMap')].filter(occupied);
  const controls = nodes.filter(el => el.matches('[data-input],[data-key]'));
  const label = el => el.getAttribute('aria-label') || el.id || el.textContent.trim().slice(0,40) || el.tagName;
  const road = { left: innerWidth * .29, right: innerWidth * .71, top: innerHeight * .35, bottom: innerHeight * .66 };
  const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  const issues = [];
  if (!nodes.some(el => el.hasAttribute('data-drive-readout'))) issues.push('Missing visible HUD readout');
  if (touch && controls.length !== 6) issues.push('Expected six visible driving controls, found ' + controls.length);
  for (const [i, el] of nodes.entries()) {
    const rect = el.getBoundingClientRect();
    if (rect.left < -1 || rect.top < -1 || rect.right > innerWidth+1 || rect.bottom > innerHeight+1) issues.push(label(el)+' outside viewport');
    if (overlaps(rect, road)) issues.push(label(el)+' covers central driving view');
    for (const other of nodes.slice(i+1)) {
      if (!el.contains(other) && !other.contains(el) && overlaps(rect,other.getBoundingClientRect())) issues.push(label(el)+' overlaps '+label(other));
    }
    if (!el.matches('button,select')) continue;
    if (touch && (rect.width < 43.9 || rect.height < 43.9)) issues.push(label(el)+' touch area '+rect.width+'×'+rect.height);
    for (const [x,y] of [[.5,.5],[.22,.22],[.78,.78]]) {
      if (!el.contains(document.elementFromPoint(rect.left+rect.width*x,rect.top+rect.height*y))) issues.push(label(el)+' blocked');
    }
  }
  const centers = nodes.filter(el => el.matches('button,select')).map(el => {
    const r=el.getBoundingClientRect();return { x:r.x+r.width/2, y:r.y+r.height/2, label:label(el) };
  });
  return { frame: [innerWidth,innerHeight], issues, centers };
}

async function check(browser, base, game) {
  const context = await browser.newContext({ viewport: {width:sizes[0][0], height:sizes[0][1]}, hasTouch: !desktop, isMobile: !desktop, deviceScaleFactor: 1 });
  try {
    await context.route('**/*', route => {
      const req = route.request();
      return req.method() === 'GET' && new URL(req.url()).origin === base ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const standalone = flags.has('--standalone');
    await page.goto(base + (standalone ? '/games/'+game.slug+'/' : '/play/'+game.route+'/'));
    await page.locator('[data-playpile-notices]').waitFor({state:'attached'});
    if (!flags.has('--live')) {
      // Production initializes consent itself. Exercise the same UI locally without sending telemetry.
      await page.evaluate(async () => { const audience = await import('/site/audience.js'); audience.showAnalyticsChoice(); });
    }
    const choice = page.locator('#pp-analytics-choice');
    if (await choice.count()) assert(await choice.evaluate(el => Boolean(el.closest('[data-playpile-notices]'))));
    if (!standalone) await page.locator('#start').click();
    const slot = page.locator(standalone ? 'body' : '#frame');
    const frame = standalone ? page : page.frameLocator('#frame');
    if (flags.has('--2d')) await frame.getByRole('button',{name:'Use low-power 2D',exact:true}).click();
    if (flags.has('--2d')) await frame.getByRole('button',{name:'Try 3D graphics',exact:true}).waitFor();
    await frame.locator(game.start).first().click();
    const inner = page.frames().find(f => new URL(f.url()).pathname.startsWith('/games/'+game.slug+'/'));
    const is3D = await inner.locator('canvas').first().evaluate(el => Boolean(el.dataset.engine));
    assert.equal(is3D, !flags.has('--2d'), 'Unexpected renderer in '+game.slug);
    for (const [i, [width,height]] of sizes.entries()) {
      await page.setViewportSize({width,height});
      await inner.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const audit = await inner.evaluate(auditDriving, !desktop);
      assert.deepEqual(audit.issues, [], game.slug+' at '+audit.frame.join('×')+': '+audit.issues.join(', '));
      if (!standalone) {
        const blocked=await slot.evaluate((el,points) => {
          const frame=el.getBoundingClientRect();
          return points.filter(p=>{
            const x=frame.left+p.x,y=frame.top+p.y;
            return x>=0 && y>=0 && x<innerWidth && y<innerHeight && document.elementFromPoint(x,y)!==el;
          }).map(p=>p.label);
        },audit.centers);
        assert.deepEqual(blocked,[],game.slug+' buttons covered by storefront after rotation: '+blocked.join(', '));
      }
      if (i===0 && process.env.HUD_CAPTURES) {
        await fs.mkdir(process.env.HUD_CAPTURES,{recursive:true});
        await slot.screenshot({path:path.join(process.env.HUD_CAPTURES,game.slug+'.jpg'),type:'jpeg',quality:87});
      }
      await inner.locator(game.menu).click();
      const panel = inner.locator(game.panel);
      await panel.waitFor({state:'visible'});
      const menuItems = panel.locator('button:visible,select:visible,summary:visible');
      const conflicts = await menuItems.evaluateAll(items => items.flatMap((el,index) => {
        const a=el.getBoundingClientRect();
        return items.slice(index+1).filter(other => {
          const b=other.getBoundingClientRect();
          return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        }).map(other => [el.id || el.textContent,other.id || other.textContent]);
      }));
      assert.deepEqual(conflicts,[],game.slug+' overlapping menu actions');
      for (const button of await menuItems.all()) {
        if (!await button.isEnabled()) continue;
        await button.scrollIntoViewIfNeeded();
        const reachable = await button.evaluate(el => {
          const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        });
        assert(reachable, game.slug+' menu item covered: '+await button.innerText());
      }
      await inner.locator('#resume').click();
      await panel.waitFor({state:'hidden'});
    }
    await inner.locator('canvas').first().focus();
    await page.keyboard.down('ArrowUp');
    await inner.waitForFunction(selector => parseInt(document.querySelector(selector).textContent,10) >= 5, game.speed);
    await page.keyboard.up('ArrowUp');
    assert.deepEqual(errors,[]);
    console.log(game.slug+' passed '+sizes.length+' layouts, menu hit tests and acceleration');
  } finally { await context.close(); }
}

(async () => {
  const server = flags.has('--live') ? null : serve();
  if (server) await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = flags.has('--webkit') ? await webkit.launch() : await chromium.launch({channel:'chrome'});
    const base = server ? 'http://127.0.0.1:'+server.address().port : 'https://playpile.net';
    const selected = games.filter(game => !onlyGame || game.slug === onlyGame);
    assert(selected.length, 'Unknown game '+onlyGame);
    for (const game of selected) await check(browser,base,game);
  } finally { if (browser) await browser.close(); if (server) server.close(); }
})().catch(err => {console.error(err);process.exitCode=1;});
