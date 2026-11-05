const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const counter = fs.readFileSync(path.join(root, 'site/analytics.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'games/_shared/mobile.js'), 'utf8');

function browser(hostname, embedded = false) {
  const scripts = [];
  const window = {};
  window.self = window;
  window.top = embedded ? {} : window;
  const context = {
    window,
    location: { hostname, pathname: '/games/hoops/' },
    navigator: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    document: {
      querySelector: () => scripts.find(script => script.attributes['data-cf-beacon']) || null,
      createElement: tag => ({ tag, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }),
      head: { appendChild: script => scripts.push(script) }
    }
  };
  // Analytics must never inspect local game data, even if storage is available.
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Analytics read local storage'); } });
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Analytics read local storage'); } });
  Object.defineProperty(context.document, 'cookie', { get() { throw new Error('Analytics read cookies'); } });
  return { scripts, context: vm.createContext(context) };
}

test('production pages load exactly one official beacon with only the public site token', () => {
  for (const hostname of ['playpile.net', 'www.playpile.net']) {
    const page = browser(hostname);
    vm.runInContext(counter, page.context);
    vm.runInContext(counter, page.context);
    assert.equal(page.scripts.length, 1);
    assert.equal(page.scripts[0].type, 'module');
    assert.equal(page.scripts[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
    assert.deepEqual(JSON.parse(page.scripts[0].attributes['data-cf-beacon']), {
      token: '7b5cd74e226448058a279fb14d134bb3'
    });
  }
});

test('embedded games and preview hosts do not create a beacon', () => {
  const cases = [['playpile.net', true], ['www.playpile.net', true], ['localhost', false],
    ['127.0.0.1', false], ['liam-pierce-platinum.github.io', false], ['notplaypile.net', false]];
  for (const [hostname, embedded] of cases) {
    const page = browser(hostname, embedded);
    vm.runInContext(counter, page.context);
    assert.equal(page.scripts.length, 0, hostname);
  }
});

test('standalone desktop games load analytics but embedded games and local previews do not', () => {
  for (const [hostname, embedded, expected] of [['playpile.net', false, 1],
    ['www.playpile.net', false, 1], ['playpile.net', true, 0], ['localhost', false, 0]]) {
    const page = browser(hostname, embedded);
    vm.runInContext(mobile, page.context);
    assert.equal(page.scripts.length, expected);
    if (expected) assert.equal(page.scripts[0].src, '/site/analytics.js');
  }
});

test('every full HTML content page has a shared analytics entry point', () => {
  let checked = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(filename); continue; }
      if (!filename.endsWith('.html')) continue;
      const html = fs.readFileSync(filename, 'utf8');
      if (!/<!doctype html>/i.test(html) || /http-equiv=["']refresh/i.test(html)) continue;
      assert.ok(html.includes('/site/account.js') || html.includes('../_shared/mobile.js'), path.relative(root, filename));
      checked++;
    }
  }
  walk(root);
  assert.ok(checked >= 200, `Only ${checked} pages checked`);
  console.log(`Analytics coverage: ${checked} full content pages; redirect pages and guide fragments excluded.`);
});
