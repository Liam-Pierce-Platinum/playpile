// Cold-load regression for title buttons that can render before their handlers.
// Run with Playwright and Chrome installed: node tools/check-driving-startup.cjs [--live].
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://playpile.net';
const live = process.argv.includes('--live');
const games = [
  { slug: 'night-shift', route: 'night-shift-crime-getaway-game', start: '#btn-play', next: '#btn-go' },
  { slug: 'car-soccer', route: 'turbo-goal-car-football-game', start: '#play', next: '#pauseBtn' },
];

async function check(browser, game, touch) {
  const context = await browser.newContext({
    viewport: touch ? { width: 820, height: 515 } : { width: 1100, height: 710 },
    hasTouch: touch, isMobile: touch,
  });
  let releaseEngine;
  const engineReady = new Promise(resolve => { releaseEngine = resolve; });
  try {
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET' || url.origin !== origin) return route.abort();
      if (url.pathname === '/games/' + game.slug + '/src/main.js') await engineReady;
      if (live) return route.continue();
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({path: file}); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    await page.goto(origin + '/play/' + game.route + '/');
    await page.locator('#start').click();
    const frame = page.frameLocator('#frame');
    const start = frame.locator(game.start);
    await start.waitFor();
    assert(await start.isDisabled(), game.slug + ' offered Play before its engine loaded');
    assert.match(await start.innerText(), /loading/i, 'Missing loading status in ' + game.slug);
    releaseEngine();
    // Turbo Goal's Play button pulses continuously. Tap its painted center
    // as soon as it becomes actionable, including normal host hit testing.
    await frame.locator(game.start + ':enabled').waitFor();
    await start.evaluate(el => el.scrollIntoView({block:'nearest'}));
    const box = await start.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (touch) await page.touchscreen.tap(x,y); else await page.mouse.click(x,y);
    await frame.locator(game.next).waitFor({state:'visible'});
    assert(!(await start.isVisible()), 'The first input left ' + game.slug + ' on its title screen');
    console.log(game.slug + ' started on the first enabled ' + (touch ? 'tap' : 'click'));
  } finally {
    releaseEngine();
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    for (const game of games) for (const touch of [true, false]) await check(browser, game, touch);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
